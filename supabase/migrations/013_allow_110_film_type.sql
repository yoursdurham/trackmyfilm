-- ============================================================
-- Migration 013 — Allow 110 film type in CHECK constraints
-- Run if inserts fail with pattern / enum errors for film_type or roll_details
--
-- Prerequisite: film_orders.film_type exists (migration 001).
-- Customer default_film_type CHECK is applied only if migration 010 was run.
-- ============================================================

-- film_orders.film_type (common manual constraint name)
ALTER TABLE film_orders DROP CONSTRAINT IF EXISTS film_orders_film_type_check;
ALTER TABLE film_orders
  ADD CONSTRAINT film_orders_film_type_check
  CHECK (
    film_type IS NULL
    OR film_type IN ('35mm', '120', '110', 'Disposable Camera')
  );

-- customers.default_film_type — only when column exists (migration 010)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'default_film_type'
  ) THEN
    ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_default_film_type_check;
    ALTER TABLE customers
      ADD CONSTRAINT customers_default_film_type_check
      CHECK (
        default_film_type IS NULL
        OR default_film_type IN ('35mm', '120', '110', 'Disposable Camera')
      );
  ELSE
    RAISE NOTICE 'Skipping customers_default_film_type_check — run migration 010 first to add default_film_type.';
  END IF;
END $$;
