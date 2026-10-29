-- ============================================================
-- Migration 027 — Front window high-contrast theme
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Safe to run more than once. Requires the front-window row from
-- 023_front_window_display.sql. A second run does not rewrite the row
-- when it is already yours-dark.
--
-- studio-vertical is not updated.
-- ============================================================

update displays
set theme = 'yours-dark',
    updated_at = now()
where slug = 'front-window'
  and theme is distinct from 'yours-dark';
