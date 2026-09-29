# Database Migrations

Run these in order in: **Supabase Dashboard → SQL Editor → New Query**

| File | What it does | Required |
|---|---|---|
| `001_initial_schema.sql` | Creates tables, indexes, RLS | Yes — run first |
| `002_import_base44_data.sql` | Imports test data from Base44 exports | Optional — dev/reference only |
| `009_add_film_delay_email_sent_at.sql` | Adds `film_delay_email_sent_at` to film_orders | Yes |
| `010_customer_profile_fields.sql` | Adds customer profile/preference columns, email uniqueness, `updated_at` | Yes |
| `011_backfill_customer_orders.sql` | Backfills customers from unlinked orders by email | Yes — run after 010 |
| `012_partial_scan_deliveries.sql` | Partial Color/B&W scan links and timestamps on mixed orders | Yes — for partial scan workflow |
| `013_allow_110_film_type.sql` | Extends `film_type` CHECK on `film_orders` (and `customers` if 010 ran) to include `110` | Run if 110 orders fail DB validation |

## Notes

- Migration 002 only contains Justin's 6 test orders from development. Skip it if you want to start with a clean database.
- Real customer data comes from **Customers → Import from Sheet** once the app is live.
- If the schema ever needs to change, add a new file: `003_description.sql`
