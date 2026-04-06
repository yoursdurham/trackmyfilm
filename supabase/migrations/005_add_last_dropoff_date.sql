-- ============================================================
-- Migration 005 — Add last_dropoff_date to customers
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

alter table customers
  add column if not exists last_dropoff_date date;
