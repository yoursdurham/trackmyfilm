-- ============================================================
-- Migration 010 — Customer profile fields
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Ensure first_name column exists (app uses first_name; migration 001 used name)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'first_name'
  ) THEN
    ALTER TABLE customers RENAME COLUMN name TO first_name;
  END IF;
END $$;

-- Profile + preference fields
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS preferred_contact_method text,
  ADD COLUMN IF NOT EXISTS default_film_type text,
  ADD COLUMN IF NOT EXISTS default_film_process text,
  ADD COLUMN IF NOT EXISTS default_scan_size text,
  ADD COLUMN IF NOT EXISTS default_delivery_preference text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS customers_user_id_idx ON customers (user_id);

-- One customer per email (case-insensitive) for single-tenant / null user_id rows
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_lower_unique_idx
  ON customers (lower(trim(email)))
  WHERE email IS NOT NULL AND trim(email) <> '';

-- Per-auth-user uniqueness when user_id is set
CREATE UNIQUE INDEX IF NOT EXISTS customers_user_email_unique_idx
  ON customers (user_id, lower(trim(email)))
  WHERE user_id IS NOT NULL AND email IS NOT NULL AND trim(email) <> '';

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION customers_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customers_updated_at_trigger ON customers;
CREATE TRIGGER customers_updated_at_trigger
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION customers_set_updated_at();

-- film_orders.customer_id already exists from migration 001; ensure index is present
CREATE INDEX IF NOT EXISTS film_orders_customer_id_idx ON film_orders (customer_id);
