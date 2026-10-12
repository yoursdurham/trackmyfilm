-- ============================================================
-- Migration 021 — Keep dismissed Squarespace orders
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run again. Run after 016_hard_delete_intake_rows.sql
--
-- Migration 016 removed status 'dismissed' and deleted those rows,
-- so Dismiss had to delete the intake row. Check Squarespace could
-- then import the same order again. Dismissal is stored on the row.
-- Pending Intake only lists status 'Pending Intake'. Later imports
-- skip a dismissed row by Squarespace order id (external_order_id)
-- and by order number (01034 and 1034 match).
--
-- The app still lists, accepts, and imports if this has not been run.
-- Dismiss itself fails with a clear error until this constraint allows
-- status 'dismissed' again.
-- ============================================================

alter table incoming_squarespace_drafts
  drop constraint if exists incoming_squarespace_drafts_status_check;

alter table incoming_squarespace_drafts
  add constraint incoming_squarespace_drafts_status_check
  check (status in ('Pending Intake', 'accepted', 'dismissed'));

comment on column incoming_squarespace_drafts.status is
  'Pending Intake is the queue. accepted is linked to a film order. dismissed stays so that Squarespace order is not imported again.';
