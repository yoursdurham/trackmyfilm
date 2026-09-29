-- ============================================================
-- Migration 012 — Partial Color / B&W scan delivery (mixed orders)
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

alter table film_orders
  add column if not exists color_scans_wetransfer_link text,
  add column if not exists color_scans_delivered_at timestamptz,
  add column if not exists color_partial_email_sent_at timestamptz,
  add column if not exists bw_scans_wetransfer_link text,
  add column if not exists bw_scans_delivered_at timestamptz,
  add column if not exists bw_partial_email_sent_at timestamptz;
