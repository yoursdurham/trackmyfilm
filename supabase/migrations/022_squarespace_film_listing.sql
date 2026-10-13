-- ============================================================
-- Migration 022 — Squarespace film type listing
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run again. Run after 021_keep_dismissed_squarespace_orders.sql
--
-- Stores the customer's free-text answer to the product question
-- "PLEASE LIST WHAT FILM TYPE(S) YOU ARE DROPPING OFF", or the same
-- question on the order form. Check Squarespace still imports when this
-- column is missing: matched film stocks are saved on roll_details, and
-- an unmatched answer is saved in notes. The Pending Intake card shows
-- this raw answer once the column exists.
--
-- Exact SQL:
--
--   alter table incoming_squarespace_drafts
--     add column if not exists squarespace_film_listing text;
--
--   comment on column incoming_squarespace_drafts.squarespace_film_listing is
--     'Raw film type answer from Squarespace line-item customizations or order formSubmission.';
-- ============================================================

alter table incoming_squarespace_drafts
  add column if not exists squarespace_film_listing text;

comment on column incoming_squarespace_drafts.squarespace_film_listing is
  'Raw film type answer from Squarespace line-item customizations or order formSubmission.';
