-- ============================================================
-- Migration 029 — Open sign manual override
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Safe to run more than once. A later run does not change a mode
-- someone has already set.
--
-- show_open_sign true becomes auto (follow retail hours).
-- show_open_sign false becomes off. On now is chosen from the
-- Displays page and lasts until open_sign_until.
-- ============================================================

alter table displays add column if not exists open_sign_mode text;
alter table displays add column if not exists open_sign_until timestamptz;

update displays
set open_sign_mode = case
  when show_open_sign is true then 'auto'
  else 'off'
end
where open_sign_mode is null;

alter table displays alter column open_sign_mode set default 'off';
alter table displays alter column open_sign_mode set not null;

alter table displays drop constraint if exists displays_open_sign_mode_check;
alter table displays add constraint displays_open_sign_mode_check
  check (open_sign_mode in ('auto', 'on', 'off'));

comment on column displays.open_sign_mode is
  'Front window only. auto follows published retail hours, on forces the Open sign until open_sign_until, off hides it.';

comment on column displays.open_sign_until is
  'When open_sign_mode is on, the force ends at this instant (midnight America/New_York) and the screen returns to auto.';
