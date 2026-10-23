-- ============================================================
-- Migration 025 — Instagram and film stock on photo submissions
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run again.
--
-- This file is NOT applied by the app. Run it yourself.
-- Migration 024 is unchanged.
--
-- Both values describe the whole batch. Each photo row stores the
-- same handle and stock. Null means the customer left the field blank.
-- instagram_handle is stored without a leading @.
-- ============================================================

alter table public.photo_submissions
  add column if not exists instagram_handle text,
  add column if not exists film_stock text;

alter table public.photo_submissions
  drop constraint if exists photo_submissions_instagram_handle_check;

alter table public.photo_submissions
  add constraint photo_submissions_instagram_handle_check
  check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');

alter table public.photo_submissions
  drop constraint if exists photo_submissions_film_stock_check;

alter table public.photo_submissions
  add constraint photo_submissions_film_stock_check
  check (
    film_stock is null
    or (char_length(btrim(film_stock)) > 0 and char_length(film_stock) <= 60)
  );
