-- Columns the app writes on film_orders. They already exist on the hosted
-- project and were not included in migrations 001–022, so a fresh local
-- database rejected new drop-offs (missing roll_details).

alter table film_orders add column if not exists roll_details jsonb;
alter table film_orders add column if not exists prints_4x6 boolean default false;
alter table film_orders add column if not exists customer_notes text;
alter table film_orders add column if not exists last_emailed_at timestamp;
alter table film_orders add column if not exists pending_intake boolean not null default false;
alter table film_orders add column if not exists import_source text;
alter table film_orders add column if not exists external_order_id text;
alter table film_orders add column if not exists imported_at timestamptz;
