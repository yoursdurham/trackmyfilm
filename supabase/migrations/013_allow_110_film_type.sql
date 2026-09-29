-- ============================================================
-- Migration 013 — Allow 110 film type in CHECK constraints
-- Run if inserts fail with pattern / enum errors for film_type or roll_details
-- ============================================================

-- film_orders.film_type (common manual constraint name)
ALTER TABLE film_orders DROP CONSTRAINT IF EXISTS film_orders_film_type_check;
ALTER TABLE film_orders
  ADD CONSTRAINT film_orders_film_type_check
  CHECK (
    film_type IS NULL
    OR film_type IN ('35mm', '120', '110', 'Disposable Camera')
  );

-- customers.default_film_type
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_default_film_type_check;
ALTER TABLE customers
  ADD CONSTRAINT customers_default_film_type_check
  CHECK (
    default_film_type IS NULL
    OR default_film_type IN ('35mm', '120', '110', 'Disposable Camera')
  );
