-- ============================================================
-- Migration 033 — Marketing email
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- This file is NOT applied by the app. Run it yourself.
-- Safe to run again. It does not send email, create Resend
-- audiences, or turn on an automation.
--
-- Number 033 skips 032_customer_rewards.sql, which lives on the
-- unmerged rewards branch and is not part of this change.
--
-- Subscription rows are the only marketing consent. A customer, an
-- order, or a sign-in account does not insert one.
-- Staff routes use the service role. anon and authenticated have no
-- access. The preference page is a server route with a signed token.
-- ============================================================

create table if not exists public.marketing_settings (
  id integer primary key check (id = 1),
  physical_address text not null,
  from_name text not null default 'Yours,',
  reply_to text,
  frequency_cap_count integer not null default 4 check (frequency_cap_count >= 0 and frequency_cap_count <= 30),
  frequency_cap_days integer not null default 30 check (frequency_cap_days >= 1 and frequency_cap_days <= 365),
  attribution_window_days integer not null default 14 check (attribution_window_days >= 1 and attribution_window_days <= 90),
  timezone text not null default 'America/New_York',
  updated_at timestamptz not null default now()
);

insert into public.marketing_settings (id, physical_address)
values (1, '209 N. Gregson St, Durham, NC 27701')
on conflict (id) do nothing;

create table if not exists public.marketing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete set null,
  email text not null,
  status text not null check (status in ('subscribed', 'unsubscribed', 'suppressed')),
  suppression_reason text check (suppression_reason is null or suppression_reason in ('bounced', 'complained', 'invalid', 'manual')),
  source text not null,
  consented_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_subscriptions_email_unique unique (email),
  constraint marketing_subscriptions_consent_check check (status <> 'subscribed' or consented_at is not null)
);

create index if not exists marketing_subscriptions_status_idx
  on public.marketing_subscriptions (status);

create table if not exists public.marketing_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  filter jsonb not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null default '',
  preview_text text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  plain_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'paused', 'failed', 'archived')),
  segment_id uuid references public.marketing_segments (id) on delete set null,
  ad_hoc_filter jsonb,
  subject text not null default '',
  preview_text text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  plain_text text not null default '',
  scheduled_at timestamptz,
  timezone text not null default 'America/New_York',
  audience_fingerprint text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_campaigns_status_idx
  on public.marketing_campaigns (status, updated_at desc);

create table if not exists public.marketing_automations (
  id uuid primary key,
  name text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  trigger jsonb not null,
  delay_hours integer not null default 0 check (delay_hours >= 0 and delay_hours <= 8760),
  eligibility jsonb not null,
  exits jsonb not null default '[]'::jsonb,
  cooldown_days integer not null default 30 check (cooldown_days >= 0 and cooldown_days <= 3650),
  reentry text not null default 'never' check (reentry in ('never', 'after_cooldown')),
  subject text not null default '',
  preview_text text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  plain_text text not null default '',
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_automations_active_check check (status <> 'active' or activated_at is not null)
);

create table if not exists public.marketing_enrollments (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.marketing_automations (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  email text not null,
  generation integer not null default 1 check (generation >= 1),
  status text not null check (status in ('waiting', 'sent', 'exited', 'failed')),
  event_at timestamptz not null,
  due_at timestamptz not null,
  enrolled_at timestamptz not null default now(),
  sent_at timestamptz,
  exited_at timestamptz,
  exit_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (automation_id, email, generation)
);

create unique index if not exists marketing_enrollments_one_waiting
  on public.marketing_enrollments (automation_id, email)
  where status = 'waiting';

create index if not exists marketing_enrollments_due_idx
  on public.marketing_enrollments (status, due_at);

create table if not exists public.marketing_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.marketing_campaigns (id) on delete cascade,
  enrollment_id uuid references public.marketing_enrollments (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  email text not null,
  status text not null check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled')),
  skip_reason text,
  resend_id text,
  idempotency_key text not null,
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_deliveries_target_check check (
    (campaign_id is not null and enrollment_id is null)
    or (campaign_id is null and enrollment_id is not null)
  ),
  constraint marketing_deliveries_idempotency_unique unique (idempotency_key)
);

create unique index if not exists marketing_deliveries_campaign_email_idx
  on public.marketing_deliveries (campaign_id, email);

create unique index if not exists marketing_deliveries_enrollment_idx
  on public.marketing_deliveries (enrollment_id);

create index if not exists marketing_deliveries_status_idx
  on public.marketing_deliveries (status, updated_at);

create index if not exists marketing_deliveries_resend_idx
  on public.marketing_deliveries (resend_id);

create table if not exists public.marketing_events (
  id uuid primary key default gen_random_uuid(),
  provider_id text,
  type text not null,
  delivery_id uuid,
  email text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint marketing_events_provider_unique unique (provider_id)
);

create table if not exists public.marketing_audit (
  id uuid primary key default gen_random_uuid(),
  actor text,
  action text not null,
  entity_type text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists marketing_audit_created_idx
  on public.marketing_audit (created_at desc);

alter table public.marketing_settings enable row level security;
alter table public.marketing_subscriptions enable row level security;
alter table public.marketing_segments enable row level security;
alter table public.marketing_templates enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_automations enable row level security;
alter table public.marketing_enrollments enable row level security;
alter table public.marketing_deliveries enable row level security;
alter table public.marketing_events enable row level security;
alter table public.marketing_audit enable row level security;

alter table public.marketing_settings force row level security;
alter table public.marketing_subscriptions force row level security;
alter table public.marketing_segments force row level security;
alter table public.marketing_templates force row level security;
alter table public.marketing_campaigns force row level security;
alter table public.marketing_automations force row level security;
alter table public.marketing_enrollments force row level security;
alter table public.marketing_deliveries force row level security;
alter table public.marketing_events force row level security;
alter table public.marketing_audit force row level security;

revoke all on table public.marketing_settings from public, anon, authenticated;
revoke all on table public.marketing_subscriptions from public, anon, authenticated;
revoke all on table public.marketing_segments from public, anon, authenticated;
revoke all on table public.marketing_templates from public, anon, authenticated;
revoke all on table public.marketing_campaigns from public, anon, authenticated;
revoke all on table public.marketing_automations from public, anon, authenticated;
revoke all on table public.marketing_enrollments from public, anon, authenticated;
revoke all on table public.marketing_deliveries from public, anon, authenticated;
revoke all on table public.marketing_events from public, anon, authenticated;
revoke all on table public.marketing_audit from public, anon, authenticated;

grant all on table public.marketing_settings to service_role;
grant all on table public.marketing_subscriptions to service_role;
grant all on table public.marketing_segments to service_role;
grant all on table public.marketing_templates to service_role;
grant all on table public.marketing_campaigns to service_role;
grant all on table public.marketing_automations to service_role;
grant all on table public.marketing_enrollments to service_role;
grant all on table public.marketing_deliveries to service_role;
grant all on table public.marketing_events to service_role;
grant all on table public.marketing_audit to service_role;
