-- ============================================================
-- Migration 030 — RLS auth initplan
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run again. Run after 023.
--
-- This file is NOT applied by the app. Run it yourself.
--
-- 023 lets a signed-in customer read their own film_orders and
-- customers rows. Those policies called auth.jwt() in the row
-- filter, so Postgres re-evaluated it for every row (Supabase
-- lint 0003_auth_rls_initplan). Wrapping the call in a scalar
-- subquery makes it an initplan: once per query.
--
-- Who can see a row does not change. A row is visible only when
-- its email is non-blank and, after trim and lower, equals the
-- JWT email after the same trim and lower.
--
-- film_orders already has film_orders_customer_email_lower_idx
-- from 023, on lower(trim(customer_email)), with the same
-- partial predicate as the policy. customers only has
-- customers_email_idx on the raw email column, which cannot
-- serve lower(trim(email)) = <constant>. The index below is
-- that lookup. It is not unique. 010 already declares
-- customers_email_lower_unique_idx; this file does not create
-- that constraint.
-- ============================================================

drop policy if exists customer_reads_own_orders on public.film_orders;
create policy customer_reads_own_orders
  on public.film_orders
  for select
  to authenticated
  using (
    customer_email is not null
    and trim(customer_email) <> ''
    and lower(trim(customer_email)) = lower(trim(coalesce((select auth.jwt() ->> 'email'), '')))
  );

drop policy if exists customer_reads_own_profile on public.customers;
create policy customer_reads_own_profile
  on public.customers
  for select
  to authenticated
  using (
    email is not null
    and trim(email) <> ''
    and lower(trim(email)) = lower(trim(coalesce((select auth.jwt() ->> 'email'), '')))
  );

create index if not exists customers_email_lower_trim_idx
  on public.customers (lower(trim(email)))
  where email is not null and trim(email) <> '';
