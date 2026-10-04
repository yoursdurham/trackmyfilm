-- ============================================================
-- Migration 015 — Incoming Squarespace drop-off drafts
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- These rows wait as Pending Intake. Import does not create a film order,
-- set Received by Yours, or send email. Approve & Receive does that.
-- ============================================================

create table incoming_squarespace_drafts (
  id                        uuid primary key default gen_random_uuid(),
  squarespace_order_number text not null,
  external_order_id         text not null,
  customer_name             text not null,
  customer_email            text,
  dropoff_date              date,
  roll_count                integer not null,
  roll_details              jsonb not null default '[]'::jsonb,
  notes                     text,
  import_source             text not null default 'squarespace',
  status                    text not null default 'Pending Intake',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint incoming_squarespace_drafts_order_number_normalized
    check (squarespace_order_number = upper(btrim(squarespace_order_number))),
  constraint incoming_squarespace_drafts_customer_name_present
    check (char_length(btrim(customer_name)) > 0),
  constraint incoming_squarespace_drafts_roll_count_check
    check (roll_count >= 1 and roll_count <= 20),
  constraint incoming_squarespace_drafts_roll_details_shape
    check (
      case
        when jsonb_typeof(roll_details) = 'array'
        then jsonb_array_length(roll_details) = roll_count
        else false
      end
    ),
  constraint incoming_squarespace_drafts_external_order_id_present
    check (char_length(btrim(external_order_id)) > 0),
  constraint incoming_squarespace_drafts_status_check
    check (status in ('Pending Intake', 'accepted', 'dismissed')),
  constraint incoming_squarespace_drafts_import_source_present
    check (char_length(btrim(import_source)) > 0)
);

-- One Squarespace order number can enter the queue once, in any status.
create unique index incoming_squarespace_drafts_order_number_idx
  on incoming_squarespace_drafts (squarespace_order_number);

create unique index incoming_squarespace_drafts_external_order_id_idx
  on incoming_squarespace_drafts (external_order_id);

create index incoming_squarespace_drafts_status_created_idx
  on incoming_squarespace_drafts (status, created_at desc);

comment on table incoming_squarespace_drafts is
  'Squarespace orders waiting as Pending Intake until staff clicks Approve & Receive.';

-- API routes use the service role key, which bypasses RLS.
-- No policies: the Data API (anon/authenticated) cannot read or write drafts.
alter table incoming_squarespace_drafts enable row level security;
