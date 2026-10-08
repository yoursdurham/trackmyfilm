-- ============================================================
-- Migration 017 — Displays
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Safe to run more than once. There is no 004_*.sql in this repo;
-- 017 continues after 016.
--
-- API routes use the service role key, which bypasses RLS.
-- No policies: the Data API (anon/authenticated) cannot read or write screens.
-- playlist_id is reserved for a later phase and has no foreign key yet.
-- ============================================================

create table if not exists displays (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null,
  name              text not null,
  location          text,
  orientation       text not null default 'portrait',
  resolution        text,
  mode              text not null default 'idle',
  playlist_id       uuid,
  theme             text not null default 'yours-clean',
  is_enabled        boolean not null default true,
  last_seen         timestamptz,
  last_client       jsonb,
  override_mode     text,
  override_payload  jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint displays_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint displays_orientation_check
    check (orientation in ('portrait', 'landscape')),
  constraint displays_name_present
    check (char_length(btrim(name)) > 0)
);

alter table displays add column if not exists location text;
alter table displays add column if not exists orientation text not null default 'portrait';
alter table displays add column if not exists resolution text;
alter table displays add column if not exists mode text not null default 'idle';
alter table displays add column if not exists playlist_id uuid;
alter table displays add column if not exists theme text not null default 'yours-clean';
alter table displays add column if not exists is_enabled boolean not null default true;
alter table displays add column if not exists last_seen timestamptz;
alter table displays add column if not exists last_client jsonb;
alter table displays add column if not exists override_mode text;
alter table displays add column if not exists override_payload jsonb;
alter table displays add column if not exists created_at timestamptz not null default now();
alter table displays add column if not exists updated_at timestamptz not null default now();

create unique index if not exists displays_slug_idx on displays (slug);

comment on table displays is
  'Physical screens. Public routes return a whitelisted payload; browsers cannot query this table.';

alter table displays enable row level security;

insert into displays (slug, name, location, orientation, resolution, mode, theme, is_enabled)
values (
  'studio-vertical',
  'Studio Vertical',
  'Studio',
  'portrait',
  '1080x3840',
  'idle',
  'yours-clean',
  true
)
on conflict (slug) do nothing;
