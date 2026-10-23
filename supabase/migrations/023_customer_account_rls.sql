-- ============================================================
-- Migration 023 — Customer account read access
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run again.
--
-- This file is NOT applied by the app. Run it yourself before /account
-- can show orders. Until then, RLS with no policies returns no rows.
--
-- A signed-in customer may read only the film_orders and customers rows
-- whose email matches the verified auth email, case-insensitive.
-- Staff notes, hold reasons, and email delivery columns are not granted.
-- The service role used by staff pages, tracking, displays, email, and cron
-- bypasses RLS. It is re-granted below so this script does not depend on
-- an older PUBLIC grant. anon has no access.
-- Staff browser sessions use the anon key only for Auth (getUser, sign-in,
-- sign-out). They do not read or write these tables as the authenticated role.
-- ============================================================

create index if not exists film_orders_customer_email_lower_idx
  on public.film_orders (lower(trim(customer_email)))
  where customer_email is not null and trim(customer_email) <> '';

revoke all on table public.film_orders from public, anon, authenticated;
revoke all on table public.customers from public, anon, authenticated;

-- Supabase default privileges also grant these tables to service_role.
-- Say so again after the revoke. service_role has BYPASSRLS, so the
-- policies below do not apply to it.
grant all on table public.film_orders to service_role;
grant all on table public.customers to service_role;

grant select (
  id,
  order_number,
  customer_name,
  customer_email,
  status,
  status_history,
  film_type,
  film_process,
  film_stock,
  roll_count,
  roll_details,
  dropoff_date,
  dropoff_number,
  wetransfer_link,
  color_scans_wetransfer_link,
  bw_scans_wetransfer_link,
  scan_notes,
  received_by_yours_at,
  scans_sent_at,
  created_at
) on table public.film_orders to authenticated;

-- customers.phone was created in 001 and dropped in 007. Migration 010
-- adds it again, but the live table does not have it, so it is not granted.
grant select (
  id,
  first_name,
  last_name,
  email
) on table public.customers to authenticated;

alter table public.film_orders enable row level security;
alter table public.film_orders force row level security;
alter table public.customers enable row level security;
alter table public.customers force row level security;

drop policy if exists customer_reads_own_orders on public.film_orders;
create policy customer_reads_own_orders
  on public.film_orders
  for select
  to authenticated
  using (
    customer_email is not null
    and trim(customer_email) <> ''
    and lower(trim(customer_email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  );

drop policy if exists customer_reads_own_profile on public.customers;
create policy customer_reads_own_profile
  on public.customers
  for select
  to authenticated
  using (
    email is not null
    and trim(email) <> ''
    and lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  );
