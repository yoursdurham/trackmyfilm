-- ============================================================
-- Migration 024 — Customer photo submissions
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run again.
--
-- This file is NOT applied by the app. Run it yourself.
--
-- Photos stay private until a staff member sets status to approved.
-- There is no policy for anon or authenticated, so the Data API cannot
-- read these rows. The app uploads with the service role from server
-- routes only. A later gallery or studio slideshow should select
-- status = 'approved' on the server and hand out short-lived signed
-- URLs. Do not add a public Storage policy.
--
-- Bucket, if the storage insert at the bottom fails:
-- 1. Supabase Dashboard → Storage → New bucket
-- 2. Name: photo-submissions
-- 3. Public bucket: off
-- 4. File size limit: 15 MB, if the form asks
-- 5. Allowed MIME types, if the form asks:
--    image/jpeg, image/png, image/heic, image/heif
-- 6. Save. Do not add a policy for anon or authenticated.
-- If that insert fails, delete it and run the rest of this file,
-- then create the bucket with those steps. The whole script runs in
-- one transaction, so a failed insert rolls back the table too.
-- ============================================================

create table if not exists public.photo_submissions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete set null,
  email text not null,
  storage_path text not null,
  status text not null default 'pending',
  permission_given_at timestamptz not null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  constraint photo_submissions_status_check check (status in ('pending', 'approved', 'rejected')),
  constraint photo_submissions_email_check check (length(trim(email)) > 0),
  constraint photo_submissions_storage_path_check check (position('/' in storage_path) = 0)
);

create index if not exists photo_submissions_status_created_idx
  on public.photo_submissions (status, created_at desc);

alter table public.photo_submissions enable row level security;
alter table public.photo_submissions force row level security;

revoke all on table public.photo_submissions from public, anon, authenticated;
grant all on table public.photo_submissions to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photo-submissions',
  'photo-submissions',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
