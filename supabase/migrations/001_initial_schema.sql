-- ============================================================
-- Migration 001 — Initial schema
-- Run this once in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ─── Customers ───────────────────────────────────────────────
create table customers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  last_name       text,
  email           text,
  phone           text,
  normalized_name text,
  notes           text,
  wetransfer_link text,
  total_rolls     integer not null default 0,
  total_dropoffs  integer not null default 0,
  points          integer not null default 0,
  created_at      timestamptz not null default now()
);

create index customers_email_idx          on customers (email);
create index customers_normalized_name_idx on customers (normalized_name);

-- ─── Film Orders ─────────────────────────────────────────────
create table film_orders (
  id                       uuid primary key default gen_random_uuid(),
  customer_id              uuid references customers(id) on delete set null,
  customer_name            text not null,
  customer_email           text,
  order_number             text not null,
  dropoff_date             date,
  roll_count               integer not null,
  film_type                text,                   -- '35mm' | '120'
  film_process             text,                   -- 'Color' | 'Black & White' | 'Both'
  dropoff_number           integer,                -- nth drop-off for this customer
  status                   text not null default 'Received by Yours',
  status_history           jsonb not null default '[]', -- [{status, changed_at}]
  status_updated_at        timestamptz,
  received_by_yours_at     timestamptz,
  at_lab_at                timestamptz,
  scans_sent_at            timestamptz,
  wetransfer_link          text,
  notes                    text,
  -- Email tracking
  email_status             text,                   -- 'sent' | 'failed' | null
  email_error              text,
  received_email_sent_at   timestamptz,
  at_lab_email_sent_at     timestamptz,
  scans_sent_email_sent_at timestamptz,
  created_at               timestamptz not null default now()
);

create unique index film_orders_order_number_idx on film_orders (order_number);
create index        film_orders_customer_id_idx  on film_orders (customer_id);
create index        film_orders_status_idx       on film_orders (status);

-- ─── Row Level Security ──────────────────────────────────────
-- API routes use the service role key, which bypasses RLS.
-- RLS prevents any accidental direct browser access to the DB.
alter table customers   enable row level security;
alter table film_orders enable row level security;
