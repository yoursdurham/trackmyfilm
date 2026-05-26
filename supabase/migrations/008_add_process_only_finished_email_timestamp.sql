-- ============================================================
-- Migration 008 — Track Process Only completion email separately
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

alter table film_orders
  add column if not exists process_only_finished_emailed_at timestamptz;
