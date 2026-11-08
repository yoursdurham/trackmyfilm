-- ============================================================
-- Migration 031 — Squarespace POS drafts and customer email link
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run again. Run after 022_squarespace_film_listing.sql
--
-- Check Squarespace now stages online and in-person (POS) orders.
-- The staged customer name is left blank. Staff type it when the film
-- arrives. If the order email matches customers.email, customer_id
-- points at that profile and the name stays blank on this row.
--
-- Exact SQL:
--
--   alter table incoming_squarespace_drafts
--     drop constraint if exists incoming_squarespace_drafts_customer_name_present;
--
--   alter table incoming_squarespace_drafts
--     alter column customer_name set default '';
--
--   alter table incoming_squarespace_drafts
--     add column if not exists customer_id uuid references customers (id) on delete set null;
--
--   alter table incoming_squarespace_drafts
--     add column if not exists squarespace_channel text;
--
--   alter table incoming_squarespace_drafts
--     drop constraint if exists incoming_squarespace_drafts_squarespace_channel_check;
--
--   alter table incoming_squarespace_drafts
--     add constraint incoming_squarespace_drafts_squarespace_channel_check
--     check (squarespace_channel is null or squarespace_channel in ('web', 'pos'));
-- ============================================================

alter table incoming_squarespace_drafts
  drop constraint if exists incoming_squarespace_drafts_customer_name_present;

alter table incoming_squarespace_drafts
  alter column customer_name set default '';

alter table incoming_squarespace_drafts
  add column if not exists customer_id uuid references customers (id) on delete set null;

create index if not exists incoming_squarespace_drafts_customer_id_idx
  on incoming_squarespace_drafts (customer_id);

alter table incoming_squarespace_drafts
  add column if not exists squarespace_channel text;

alter table incoming_squarespace_drafts
  drop constraint if exists incoming_squarespace_drafts_squarespace_channel_check;

alter table incoming_squarespace_drafts
  add constraint incoming_squarespace_drafts_squarespace_channel_check
  check (squarespace_channel is null or squarespace_channel in ('web', 'pos'));

comment on column incoming_squarespace_drafts.customer_name is
  'Blank on Squarespace import, including POS. Staff enter the name when receiving the film.';

comment on column incoming_squarespace_drafts.customer_id is
  'Existing customer whose email matches the Squarespace order. Null when there is no match. Deleting the customer clears the link and leaves the draft.';

comment on column incoming_squarespace_drafts.squarespace_channel is
  'Squarespace Orders API channel: web or pos. Null on rows imported before this column existed.';
