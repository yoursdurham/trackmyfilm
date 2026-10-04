-- Pending Intake: Squarespace (or other) imports before physical receipt at Yours.
-- Does not change existing rows (pending_intake defaults to false).

alter table film_orders
  add column if not exists pending_intake boolean not null default false;

alter table film_orders
  add column if not exists import_source text;

alter table film_orders
  add column if not exists external_order_id text;

alter table film_orders
  add column if not exists imported_at timestamptz;

create index if not exists film_orders_pending_intake_idx
  on film_orders (pending_intake)
  where pending_intake = true;

create unique index if not exists film_orders_external_order_id_idx
  on film_orders (import_source, external_order_id)
  where external_order_id is not null and import_source is not null;
