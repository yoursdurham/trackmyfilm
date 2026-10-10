-- ============================================================
-- Migration 020 — Staff-only reason for orders parked On Hold
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run again.
--
-- film_orders.status is unconstrained text, so "On Hold" does not
-- need a new check constraint. This column stores the optional reason.
-- The app still parks the order if this column has not been added yet;
-- only the reason text is skipped until this migration runs.
-- ============================================================

alter table film_orders
  add column if not exists hold_reason text;

comment on column film_orders.hold_reason is
  'Staff-only note while status is On Hold. Never shown on public tracking.';
