-- ============================================================
-- Migration 026 — Track Scans Only completion email separately
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run again.
--
-- This file is NOT applied by the app. Run it yourself before
-- Scans Only completion emails can record a timestamp.
--
-- Scans Only is a scan_size value ("Scans Only") stored inside
-- film_orders.roll_details (json). There is no scan_size CHECK
-- constraint to alter. This column matches
-- process_only_finished_emailed_at from migration 008.
-- ============================================================

alter table film_orders
  add column if not exists scans_only_ready_emailed_at timestamptz;
