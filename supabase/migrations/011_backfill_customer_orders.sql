-- ============================================================
-- Migration 011 — Backfill customers from existing film_orders
-- Safe to re-run: only touches orders with NULL customer_id.
-- Does NOT modify customer_name / customer_email on orders.
-- Run after 010 in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Create one customer per unique email from unlinked orders (most recent name wins)
INSERT INTO customers (
  first_name,
  last_name,
  email,
  normalized_name,
  total_rolls,
  total_dropoffs,
  created_at
)
SELECT
  split_part(trim(src.customer_name), ' ', 1) AS first_name,
  NULLIF(
    trim(substring(trim(src.customer_name) FROM position(' ' IN trim(src.customer_name)) + 1)),
    ''
  ) AS last_name,
  lower(trim(src.customer_email)) AS email,
  lower(trim(regexp_replace(src.customer_name, '\s+', ' ', 'g'))) AS normalized_name,
  0 AS total_rolls,
  0 AS total_dropoffs,
  src.created_at
FROM (
  SELECT DISTINCT ON (lower(trim(customer_email)))
    customer_email,
    customer_name,
    created_at
  FROM film_orders
  WHERE customer_id IS NULL
    AND customer_email IS NOT NULL
    AND trim(customer_email) <> ''
  ORDER BY lower(trim(customer_email)), created_at DESC
) AS src
WHERE NOT EXISTS (
  SELECT 1
  FROM customers c
  WHERE lower(trim(c.email)) = lower(trim(src.customer_email))
);

-- 2. Link unlinked orders to customers by email
UPDATE film_orders AS o
SET customer_id = c.id
FROM customers AS c
WHERE o.customer_id IS NULL
  AND o.customer_email IS NOT NULL
  AND trim(o.customer_email) <> ''
  AND lower(trim(c.email)) = lower(trim(o.customer_email));

-- 3. Refresh denormalized customer totals from linked orders (optional sync)
WITH agg AS (
  SELECT
    customer_id,
    COUNT(*)::integer AS order_count,
    COALESCE(SUM(roll_count), 0)::integer AS roll_sum,
    MAX(dropoff_date) AS last_dropoff
  FROM film_orders
  WHERE customer_id IS NOT NULL
  GROUP BY customer_id
),
latest AS (
  SELECT DISTINCT ON (customer_id)
    customer_id,
    order_number AS last_order_number
  FROM film_orders
  WHERE customer_id IS NOT NULL
  ORDER BY customer_id, dropoff_date DESC NULLS LAST, created_at DESC
)
UPDATE customers AS c
SET
  total_rolls = COALESCE(agg.roll_sum, 0),
  total_dropoffs = COALESCE(agg.order_count, 0),
  last_dropoff_date = agg.last_dropoff,
  last_order_number = latest.last_order_number
FROM agg
LEFT JOIN latest ON latest.customer_id = agg.customer_id
WHERE c.id = agg.customer_id;
