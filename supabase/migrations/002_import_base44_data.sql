-- ============================================================
-- Migration 002 — Import Base44 export data
-- Run this AFTER migration 001.
--
-- Source files (from Base44 CSV exports):
--   Customer_export.csv  — 1 customer (Justin, test data)
--   FilmOrder_export.csv — 6 orders   (all test data, all Justin)
--
-- What was cleaned:
--   - Base44 hex IDs replaced with Supabase UUIDs (auto-generated)
--   - email_status reset to null (all were 'failed' due to Base44 email bug)
--   - email_error cleared for same reason
--   - filmDropReceivedEmailSent (legacy Base44 field) dropped
--   - created_by_id / created_by / is_sample / is_deleted dropped
--   - total_rolls on Justin reset to 0 (was 694241 — accumulated test runs)
--   - Orders with duplicate order_number (333, 123) de-duped — kept most recent
--
-- NOTE: These are all test records from development. Real customer data
-- should be imported via /customers → "Import from Sheet" once the app is live.
-- ============================================================

-- ─── Customer ────────────────────────────────────────────────
-- Using a fixed UUID so we can reference it in the orders below.
insert into customers (
  id,
  name,
  last_name,
  email,
  normalized_name,
  total_rolls,
  total_dropoffs,
  points,
  created_at
) values (
  'a1000000-0000-0000-0000-000000000001',
  'Justin',
  'Eisner',
  'contact@justineisner.com',
  'justin eisner',
  0,         -- reset from 694241 (test accumulation)
  6,         -- matches the 6 imported orders below
  0,
  '2026-02-11T20:36:59Z'
);

-- ─── Film Orders ─────────────────────────────────────────────
-- Kept the 4 unique order numbers from the export.
-- Duplicates (two orders both numbered '333' and two numbered '123')
-- were de-duped by keeping only the most recent record for each number.

insert into film_orders (
  customer_id,
  customer_name,
  customer_email,
  order_number,
  dropoff_date,
  roll_count,
  film_type,
  film_process,
  dropoff_number,
  status,
  status_history,
  status_updated_at,
  received_by_yours_at,
  at_lab_at,
  scans_sent_at,
  wetransfer_link,
  created_at
) values

-- Order #123 — most recent, Received by Yours
(
  'a1000000-0000-0000-0000-000000000001',
  'Justin Eisner',
  'contact@justineisner.com',
  '123',
  '2026-03-03',
  1,
  '35mm',
  'Both',
  38,
  'Received by Yours',
  '[{"status":"Received by Yours","changed_at":"2026-03-03T14:34:13.533Z"},{"status":"Received at Lab","changed_at":"2026-03-03T14:36:00.314Z"},{"status":"Received by Yours","changed_at":"2026-03-03T14:52:57.858Z"}]',
  '2026-03-03T14:52:57.858Z',
  '2026-03-03T14:52:57.858Z',
  '2026-03-03T14:36:00.314Z',
  null,
  null,
  '2026-03-03T14:34:13.884Z'
),

-- Order #2222 — Received by Yours
(
  'a1000000-0000-0000-0000-000000000001',
  'Justin Eisner',
  'contact@justineisner.com',
  '2222',
  '2026-02-17',
  2221,
  '120',
  'Black & White',
  37,
  'Received by Yours',
  '[{"status":"Received by Yours","changed_at":"2026-02-17T23:03:42.559Z"}]',
  '2026-02-17T23:03:42.559Z',
  '2026-02-17T23:03:42.559Z',
  null,
  null,
  null,
  '2026-02-17T23:03:42.703Z'
),

-- Order #333 — most recent, Received at Lab
(
  'a1000000-0000-0000-0000-000000000001',
  'Justin Eisner',
  'contact@justineisner.com',
  '333',
  '2026-02-17',
  133333,
  '35mm',
  'Both',
  36,
  'Received at Lab',
  '[{"status":"Received by Yours","changed_at":"2026-02-17T22:54:55.754Z"},{"status":"Received at Lab","changed_at":"2026-02-17T22:55:08.655Z"}]',
  '2026-02-17T22:55:08.655Z',
  '2026-02-17T22:54:55.754Z',
  '2026-02-17T22:55:08.655Z',
  null,
  null,
  '2026-02-17T22:54:55.901Z'
),

-- Order #33 — Scans Sent, has WeTransfer link
(
  'a1000000-0000-0000-0000-000000000001',
  'Justin Eisner',
  'contact@justineisner.com',
  '33',
  '2026-02-17',
  33,
  '35mm',
  'Both',
  34,
  'Scans Sent',
  '[{"status":"Received by Yours","changed_at":"2026-02-17T22:32:54.093Z"},{"status":"Received at Lab","changed_at":"2026-02-17T22:33:03.834Z"},{"status":"Scans Sent","changed_at":"2026-02-17T22:40:29.115Z"},{"status":"Scans Sent","changed_at":"2026-02-17T22:40:32.738Z"}]',
  '2026-02-17T22:40:32.738Z',
  '2026-02-17T22:32:54.093Z',
  '2026-02-17T22:33:03.834Z',
  '2026-02-17T22:40:32.738Z',
  'https://wetransfer.com',
  '2026-02-17T22:32:54.240Z'
);
