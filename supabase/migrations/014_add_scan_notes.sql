-- ============================================================
-- Migration 014 — Customer-facing note on final scans delivery
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

alter table film_orders
  add column if not exists scan_notes text;
