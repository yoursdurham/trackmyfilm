-- Read-only collision check for order numbers that TrackMyFilm treats as the same.
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- This only SELECTs. It does not update, merge, or delete anything.
--
-- Two values share a match key when they are the same after trim, uppercase,
-- and stripping leading zeros. "01034" and "1034" share "1034". "0" and "000"
-- share "0". A blank stays blank. Prefixes are left alone, so "ORD-001" does
-- not match "ORD-1" and "JE01034" does not match "JE1034".
-- Case-only differences (JE1234 and je1234) share a key because lookups do too.
--
-- An empty result means no stored pair currently collides.
-- A row here is a pair that already slipped in. Do not merge those rows from this script.
-- Run one statement at a time so the SQL editor shows that result.

-- Film orders that collide with each other.
with keyed as (
  select
    id,
    order_number,
    customer_name,
    customer_email,
    status,
    created_at,
    case
      when length(btrim(order_number)) = 0 then ''
      when regexp_replace(upper(btrim(order_number)), '^0+', '') = '' then '0'
      else regexp_replace(upper(btrim(order_number)), '^0+', '')
    end as match_key
  from public.film_orders
),
collisions as (
  select match_key
  from keyed
  group by match_key
  having count(*) > 1
)
select
  k.match_key,
  k.order_number,
  k.customer_name,
  k.customer_email,
  k.status,
  k.created_at,
  k.id
from keyed k
join collisions c on c.match_key = k.match_key
order by k.match_key, k.created_at;

-- Intake drafts that collide with each other.
-- A draft plus the film order it became is not listed here.
with keyed as (
  select
    id,
    squarespace_order_number,
    external_order_id,
    customer_name,
    customer_email,
    status,
    created_at,
    case
      when length(btrim(squarespace_order_number)) = 0 then ''
      when regexp_replace(upper(btrim(squarespace_order_number)), '^0+', '') = '' then '0'
      else regexp_replace(upper(btrim(squarespace_order_number)), '^0+', '')
    end as match_key
  from public.incoming_squarespace_drafts
),
collisions as (
  select match_key
  from keyed
  group by match_key
  having count(*) > 1
)
select
  k.match_key,
  k.squarespace_order_number,
  k.external_order_id,
  k.customer_name,
  k.customer_email,
  k.status,
  k.created_at,
  k.id
from keyed k
join collisions c on c.match_key = k.match_key
order by k.match_key, k.created_at;
