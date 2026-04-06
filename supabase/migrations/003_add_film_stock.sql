-- ============================================================
-- Migration 003 — Add film_stock column to film_orders
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

alter table film_orders
  add column if not exists film_stock text;

-- Example values: 'Kodak Portra 400', 'Fujifilm Pro 400H', 'Ilford HP5 Plus 400', etc.
