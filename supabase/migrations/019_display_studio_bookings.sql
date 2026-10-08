-- ============================================================
-- Migration 019 — Studio bookings
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Safe to run more than once.
--   * show_studio_bookings defaults on, including studio-vertical.
--   * studio_info_lines and studio_checkout_lines start as the guest
--     copy below. A later run does not reset a switch or a list the
--     shop has edited.
--
-- Door codes and parking directions are not stored here.
-- API routes use the service role key, which bypasses RLS.
-- No policies: the Data API (anon/authenticated) cannot read or write screens.
-- ============================================================

alter table displays add column if not exists show_studio_bookings boolean not null default true;

alter table displays add column if not exists studio_info_lines jsonb not null default $info$[
  "Wi-Fi: Trinity Design Build 5G, password Trinity64",
  "Bathrooms: through the hall and to the left",
  "The conference room isn't ours, so please only pass through it to reach the bathroom or kitchen",
  "Feel free to rearrange furniture, but please put it back when you're done"
]$info$::jsonb;

alter table displays add column if not exists studio_checkout_lines jsonb not null default $checkout$[
  "Please put furniture back where it was",
  "Press the lock on the door on your way out."
]$checkout$::jsonb;

comment on column displays.show_studio_bookings is
  'When true, this screen may show Acuity studio bookings. Defaults on, including studio-vertical.';

comment on column displays.studio_info_lines is
  'Ordered guest notes for the welcome and active-session screens.';

comment on column displays.studio_checkout_lines is
  'Ordered checkout reminder for the ending-soon screen.';

alter table displays enable row level security;
