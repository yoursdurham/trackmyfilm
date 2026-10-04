-- ============================================================
-- Migration 016 — Hard-delete intake rows that block re-import
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Run after 015_incoming_squarespace_drafts.sql
--
-- Dismiss and film-order delete remove incoming_squarespace_drafts rows.
-- This cleans rows already left behind, then links accepted drafts to
-- film_orders so deleting an order also deletes the intake row.
-- ============================================================

-- Soft-dismissed rows still hold the unique order number and external id.
delete from incoming_squarespace_drafts
where status = 'dismissed';

alter table incoming_squarespace_drafts
  add column if not exists film_order_id uuid;

alter table incoming_squarespace_drafts
  drop constraint if exists incoming_squarespace_drafts_film_order_id_fkey;

alter table incoming_squarespace_drafts
  add constraint incoming_squarespace_drafts_film_order_id_fkey
  foreign key (film_order_id) references film_orders (id) on delete cascade;

-- Link an accepted draft to the film order that shares its order number.
update incoming_squarespace_drafts as d
set film_order_id = o.id
from film_orders as o
where d.film_order_id is null
  and d.squarespace_order_number = o.order_number;

-- Also link when the film order number is the Squarespace external id.
update incoming_squarespace_drafts as d
set film_order_id = o.id
from film_orders as o
where d.film_order_id is null
  and d.external_order_id = o.order_number;

-- Accepted drafts with no remaining film order still block a new import.
delete from incoming_squarespace_drafts
where status = 'accepted'
  and film_order_id is null;

alter table incoming_squarespace_drafts
  drop constraint if exists incoming_squarespace_drafts_status_check;

alter table incoming_squarespace_drafts
  add constraint incoming_squarespace_drafts_status_check
  check (status in ('Pending Intake', 'accepted'));

create index if not exists incoming_squarespace_drafts_film_order_id_idx
  on incoming_squarespace_drafts (film_order_id);
