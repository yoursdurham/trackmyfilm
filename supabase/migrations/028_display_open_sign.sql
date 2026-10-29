-- ============================================================
-- Migration 028 — Open sign during retail hours
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Safe to run more than once. A later run does not turn the switch
-- back on or off after someone has changed it.
--
-- front-window starts on. Every other screen, including
-- studio-vertical, starts off.
-- ============================================================

alter table displays add column if not exists show_open_sign boolean;

update displays
set show_open_sign = true
where slug = 'front-window'
  and show_open_sign is null;

update displays
set show_open_sign = false
where show_open_sign is null;

alter table displays alter column show_open_sign set default false;
alter table displays alter column show_open_sign set not null;

comment on column displays.show_open_sign is
  'When true, this screen shows the neon Open sign during published retail hours. The selected mode shows the rest of the time.';
