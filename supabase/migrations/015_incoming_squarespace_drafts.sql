-- ============================================================
-- Migration 015 — Incoming Squarespace drop-off drafts
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- These rows are a review queue only. They are not film orders.
-- Staff still create real orders through POST /api/dropoff.
-- ============================================================

create table incoming_squarespace_drafts (
  id                        uuid primary key default gen_random_uuid(),
  squarespace_order_number text not null,
  customer_name             text not null,
  customer_email            text,
  dropoff_date              date,
  roll_count                integer not null,
  roll_details              jsonb not null default '[]'::jsonb,
  notes                     text,
  source                    text not null default 'squarespace',
  status                    text not null default 'pending',
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
  constraint incoming_squarespace_drafts_status_check
    check (status in ('pending', 'accepted', 'dismissed')),
  constraint incoming_squarespace_drafts_source_present
    check (char_length(btrim(source)) > 0)
);

-- One Squarespace order number can enter the queue once, in any status.
create unique index incoming_squarespace_drafts_order_number_idx
  on incoming_squarespace_drafts (squarespace_order_number);

create index incoming_squarespace_drafts_status_created_idx
  on incoming_squarespace_drafts (status, created_at desc);

comment on table incoming_squarespace_drafts is
  'Squarespace orders staged for staff review. Not film orders until the New Drop-off form is submitted.';

-- API routes use the service role key, which bypasses RLS.
-- No policies: the Data API (anon/authenticated) cannot read or write drafts.
alter table incoming_squarespace_drafts enable row level security;
