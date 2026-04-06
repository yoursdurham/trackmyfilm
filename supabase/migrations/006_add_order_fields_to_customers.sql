-- ============================================================
-- Migration 006 — Add last_order_number and current_rolls to customers
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

alter table customers
  add column if not exists last_order_number text,
  add column if not exists current_rolls     integer;
