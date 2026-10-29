-- ============================================================
-- Migration 023 — Front window display
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Safe to run more than once. Requires migration 017 (the displays
-- table and displays_slug_idx). A later run does not reset a mode,
-- message, or heartbeat the shop has already set.
--
-- API routes use the service role key, which bypasses RLS.
-- No policies: the Data API (anon/authenticated) cannot read or write screens.
-- ============================================================

create unique index if not exists displays_slug_idx on displays (slug);

insert into displays (slug, name, location, orientation, resolution, mode, theme, is_enabled)
values (
  'front-window',
  'Front window',
  'Front window',
  'landscape',
  '1920x1080',
  'idle',
  'yours-clean',
  true
)
on conflict (slug) do nothing;
