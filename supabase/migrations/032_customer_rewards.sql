-- ============================================================
-- Migration 032 — Customer rewards ledger
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run again.
--
-- This file is NOT applied by the app. Run it yourself.
--
-- Every 10 qualifying rolls earns one free development + high-res
-- scan. A roll counts when the order is finished:
--   * Scans Sent (dev + scan, and scans-only)
--   * Ready for Pickup, and only when every roll is Process Only
--     (that status is the end of a process-only order; it never
--     moves on to Scans Sent)
-- 35mm, 120, and Disposable Camera count, including rolls marked
-- blank. 110 does not.
-- One earn row per order (idempotency_key earn:order:<id>), so a
-- status flip or a second import updates that row instead of
-- inserting another. Balance is the sum of earn, backfill, and
-- adjust rolls. Rewards are created from floor(balance / 10).
--
-- Orders already finished when this file first runs do not get
-- per-order earn rows. Each customer gets one backfill row of
-- min(their qualifying historical rolls, 5). Those order ids are
-- stored in reward_legacy_orders so a later status flip cannot
-- add the uncapped count. Orders finished after this run count
-- normally, on top of that starting credit. Re-running the file
-- does not take the snapshot again.
--
-- Customers may read their own rows. Staff pages use the service
-- role after the STAFF_EMAILS check, the same way orders do.
-- anon has no access.
-- ============================================================

create table if not exists public.reward_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  kind text not null,
  rolls integer not null default 0,
  order_id uuid references public.film_orders (id) on delete cascade,
  reward_id uuid,
  reason text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint reward_events_kind_check
    check (kind in ('earn', 'redeem', 'expire', 'restore', 'adjust', 'backfill')),
  constraint reward_events_rolls_check
    check (
      (kind = 'adjust' and rolls between -10000 and 10000 and rolls <> 0)
      or (kind = 'backfill' and rolls between 1 and 5)
      or (kind not in ('adjust', 'backfill') and rolls between 0 and 10000)
    ),
  constraint reward_events_idempotency_key_present
    check (char_length(btrim(idempotency_key)) > 0)
);

create unique index if not exists reward_events_idempotency_key_idx
  on public.reward_events (idempotency_key);

create unique index if not exists reward_events_one_earn_per_order_idx
  on public.reward_events (order_id)
  where kind = 'earn' and order_id is not null;

create index if not exists reward_events_customer_created_idx
  on public.reward_events (customer_id, created_at desc);

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  status text not null default 'earned',
  sequence integer not null,
  promo_code text,
  squarespace_discount_id text,
  valid_to timestamptz,
  redeemed_order uuid references public.film_orders (id) on delete set null,
  redeemed_roll_index integer,
  redeemed_via text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rewards_status_check
    check (status in ('earned', 'issued', 'redeemed', 'expired')),
  constraint rewards_redeemed_via_check
    check (redeemed_via is null or redeemed_via in ('online', 'in_store')),
  constraint rewards_sequence_positive check (sequence >= 1),
  constraint rewards_roll_index_check
    check (redeemed_roll_index is null or redeemed_roll_index >= 0),
  constraint rewards_customer_sequence_unique unique (customer_id, sequence)
);

create unique index if not exists rewards_promo_code_idx
  on public.rewards (promo_code)
  where promo_code is not null;

create index if not exists rewards_customer_status_idx
  on public.rewards (customer_id, status);

create index if not exists rewards_discount_id_idx
  on public.rewards (squarespace_discount_id)
  where squarespace_discount_id is not null;

alter table public.reward_events
  drop constraint if exists reward_events_reward_id_fkey;

alter table public.reward_events
  add constraint reward_events_reward_id_fkey
  foreign key (reward_id) references public.rewards (id) on delete set null;

create table if not exists public.reward_settings (
  id integer primary key,
  product_ids text[] not null default '{}',
  updated_at timestamptz not null default now(),
  backfill_completed_at timestamptz,
  constraint reward_settings_singleton check (id = 1)
);

alter table public.reward_settings
  add column if not exists backfill_completed_at timestamptz;

-- Orders already finished when the starting-credit snapshot was taken.
-- The app refuses to write an earn row for these ids.
create table if not exists public.reward_legacy_orders (
  order_id uuid primary key references public.film_orders (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists reward_legacy_orders_customer_id_idx
  on public.reward_legacy_orders (customer_id);

insert into public.reward_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.incoming_squarespace_drafts
  add column if not exists squarespace_promo_codes text[] not null default '{}';

comment on table public.reward_events is
  'Append-only reward ledger. Balance is the sum of earn, backfill, and adjust rolls.';

comment on table public.rewards is
  'One free dev + high-res scan. status earned, issued (online code), redeemed, or expired.';

comment on column public.reward_settings.product_ids is
  'Squarespace product ids for dev + high-res scan (35mm, 120, disposable). Same productId as an order line item.';

comment on column public.incoming_squarespace_drafts.squarespace_promo_codes is
  'Promo codes on a manually imported Squarespace order. The rewards cron reads these. It does not import orders.';

comment on table public.reward_legacy_orders is
  'Film orders already finished when starting credit was snapshotted. They do not earn again.';

comment on column public.reward_settings.backfill_completed_at is
  'Set when the capped historical snapshot is stored. A later run of this file leaves it alone.';

-- ─── Capped starting credit ──────────────────────────────────
-- One backfill row per customer, at most 5 rolls. No per-order
-- earn rows for orders finished before this snapshot. Running
-- this file again does not retake the snapshot, so orders that
-- finish later are not pulled into the cap.

do $$
begin
  if exists (
    select 1
    from public.reward_settings
    where id = 1
      and backfill_completed_at is not null
  ) then
    return;
  end if;

  drop table if exists pg_temp.reward_backfill_snapshot;
  create temporary table reward_backfill_snapshot as
  select
    o.id as order_id,
    o.customer_id,
    case
      when jsonb_typeof(o.roll_details) = 'array' and jsonb_array_length(o.roll_details) > 0 then (
        select count(*)::integer
        from jsonb_array_elements(o.roll_details) as roll
        where roll ->> 'film_type' in ('35mm', '120', 'Disposable Camera')
      )
      when o.film_type in ('35mm', '120', 'Disposable Camera')
        then greatest(coalesce(o.roll_count, 0), 0)
      else 0
    end as rolls
  from public.film_orders o
  where o.customer_id is not null
    and (
      o.status = 'Scans Sent'
      or (
        o.status = 'Ready for Pickup'
        and case
          when jsonb_typeof(o.roll_details) = 'array' and jsonb_array_length(o.roll_details) > 0 then (
            select coalesce(bool_and(
              lower(regexp_replace(coalesce(roll ->> 'scan_size', ''), '[^a-z]', '', 'g')) = 'processonly'
            ), false)
            from jsonb_array_elements(o.roll_details) as roll
            where nullif(btrim(coalesce(roll ->> 'scan_size', '')), '') is not null
          )
          else false
        end
      )
    );

  insert into public.reward_legacy_orders (order_id, customer_id)
  select order_id, customer_id
  from reward_backfill_snapshot
  on conflict (order_id) do nothing;

  insert into public.reward_events (customer_id, kind, rolls, reason, idempotency_key)
  select
    customer_id,
    'backfill',
    least(sum(rolls), 5),
    'Rolls finished before rewards. Starting credit is capped at 5, so history alone does not earn a reward.',
    'backfill:customer:' || customer_id::text
  from reward_backfill_snapshot
  group by customer_id
  having sum(rolls) > 0
  on conflict (idempotency_key) do nothing;

  update public.reward_settings
  set backfill_completed_at = now()
  where id = 1;

  drop table if exists pg_temp.reward_backfill_snapshot;
end $$;

-- ─── Row level security ──────────────────────────────────────

alter table public.reward_events enable row level security;
alter table public.reward_events force row level security;
alter table public.rewards enable row level security;
alter table public.rewards force row level security;
alter table public.reward_settings enable row level security;
alter table public.reward_settings force row level security;
alter table public.reward_legacy_orders enable row level security;
alter table public.reward_legacy_orders force row level security;

revoke all on table public.reward_events from public, anon, authenticated;
revoke all on table public.rewards from public, anon, authenticated;
revoke all on table public.reward_settings from public, anon, authenticated;
revoke all on table public.reward_legacy_orders from public, anon, authenticated;

grant all on table public.reward_events to service_role;
grant all on table public.rewards to service_role;
grant all on table public.reward_settings to service_role;
grant all on table public.reward_legacy_orders to service_role;

grant select (
  id,
  customer_id,
  kind,
  rolls,
  order_id,
  reward_id,
  reason,
  created_at
) on table public.reward_events to authenticated;

grant select (
  id,
  customer_id,
  status,
  sequence,
  promo_code,
  valid_to,
  redeemed_order,
  redeemed_roll_index,
  redeemed_via,
  created_at,
  updated_at
) on table public.rewards to authenticated;

drop policy if exists customer_reads_own_reward_events on public.reward_events;
create policy customer_reads_own_reward_events
  on public.reward_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.customers as customer
      where customer.id = reward_events.customer_id
        and customer.email is not null
        and btrim(customer.email) <> ''
        and lower(btrim(customer.email)) = lower(btrim(coalesce((select auth.jwt() ->> 'email'), '')))
    )
  );

drop policy if exists customer_reads_own_rewards on public.rewards;
create policy customer_reads_own_rewards
  on public.rewards
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.customers as customer
      where customer.id = rewards.customer_id
        and customer.email is not null
        and btrim(customer.email) <> ''
        and lower(btrim(customer.email)) = lower(btrim(coalesce((select auth.jwt() ->> 'email'), '')))
    )
  );
