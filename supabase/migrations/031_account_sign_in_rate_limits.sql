-- ============================================================
-- Migration 031 — Durable customer sign-in rate limits
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run again.
--
-- This file is NOT applied by the app. Run it yourself before
-- the drop-off email starts inviting every customer to sign in.
-- Until this function exists, /api/account/sign-in keeps the same
-- 3-attempts-per-minute cap in memory on each server instance.
--
-- One row per IP and one row per email address. The row stores the
-- address and the client IP. anon and authenticated cannot read or
-- write it. The service role, which already sends the sign-in email,
-- is the only caller. This does not change who can read an order
-- or a customer profile.
-- ============================================================

create table if not exists public.account_sign_in_rate_limits (
  bucket text primary key,
  attempt_count integer not null,
  reset_at timestamptz not null,
  constraint account_sign_in_rate_limits_count_positive check (attempt_count > 0)
);

alter table public.account_sign_in_rate_limits enable row level security;
alter table public.account_sign_in_rate_limits force row level security;

revoke all on table public.account_sign_in_rate_limits from public, anon, authenticated;
grant all on table public.account_sign_in_rate_limits to service_role;

drop policy if exists account_sign_in_rate_limits_no_api_access on public.account_sign_in_rate_limits;
create policy account_sign_in_rate_limits_no_api_access
  on public.account_sign_in_rate_limits
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Returns true when this attempt is over the limit.
-- p_email_bucket may be empty; an empty email is not counted.
-- An IP that is already over its limit does not consume the email bucket.
-- Counts stop at p_max + 1 so a flood cannot grow the counter without bound.
create or replace function public.consume_account_sign_in_rate_limit(
  p_ip_bucket text,
  p_email_bucket text,
  p_window_seconds integer,
  p_max integer
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ip_count integer;
  email_count integer;
begin
  if p_ip_bucket is null
    or pg_catalog.length(p_ip_bucket) = 0
    or pg_catalog.length(p_ip_bucket) > 320
    or p_window_seconds is null
    or p_window_seconds < 1
    or p_window_seconds > 86400
    or p_max is null
    or p_max < 1
    or p_max > 100
  then
    return true;
  end if;

  insert into public.account_sign_in_rate_limits as limits (bucket, attempt_count, reset_at)
  values (
    p_ip_bucket,
    1,
    pg_catalog.now() + pg_catalog.make_interval(secs => p_window_seconds)
  )
  on conflict (bucket) do update
    set
      attempt_count = case
        when limits.reset_at <= pg_catalog.now() then 1
        when limits.attempt_count >= p_max then p_max + 1
        else limits.attempt_count + 1
      end,
      reset_at = case
        when limits.reset_at <= pg_catalog.now()
          then pg_catalog.now() + pg_catalog.make_interval(secs => p_window_seconds)
        else limits.reset_at
      end
  returning attempt_count into ip_count;

  if ip_count > p_max then
    return true;
  end if;

  if p_email_bucket is null or pg_catalog.length(p_email_bucket) = 0 then
    return false;
  end if;

  if pg_catalog.length(p_email_bucket) > 320 then
    return true;
  end if;

  insert into public.account_sign_in_rate_limits as limits (bucket, attempt_count, reset_at)
  values (
    p_email_bucket,
    1,
    pg_catalog.now() + pg_catalog.make_interval(secs => p_window_seconds)
  )
  on conflict (bucket) do update
    set
      attempt_count = case
        when limits.reset_at <= pg_catalog.now() then 1
        when limits.attempt_count >= p_max then p_max + 1
        else limits.attempt_count + 1
      end,
      reset_at = case
        when limits.reset_at <= pg_catalog.now()
          then pg_catalog.now() + pg_catalog.make_interval(secs => p_window_seconds)
        else limits.reset_at
      end
  returning attempt_count into email_count;

  return email_count > p_max;
end;
$$;

revoke all on function public.consume_account_sign_in_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_account_sign_in_rate_limit(text, text, integer, integer)
  to service_role;

comment on table public.account_sign_in_rate_limits is
  'Per-IP and per-email counters for customer magic-link sign-in. Service role only.';

comment on function public.consume_account_sign_in_rate_limit(text, text, integer, integer) is
  'Counts one customer sign-in attempt. True means the attempt is over the limit. Service role only.';
