-- ============================================================
-- Migration 009 — Track film delay (8-day lab) email sends
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

alter table film_orders
  add column if not exists film_delay_email_sent_at timestamptz;
