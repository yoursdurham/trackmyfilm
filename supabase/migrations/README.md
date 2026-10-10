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
| `013_allow_110_film_type.sql` | Extends `film_type` CHECK constraints to include `110` | Run if 110 orders fail DB validation |
| `014_add_scan_notes.sql` | Adds optional `scan_notes` on `film_orders` for scans_sent emails | Yes — when using customer scan notes |
| `015_incoming_squarespace_drafts.sql` | Creates `incoming_squarespace_drafts` (Pending Intake queue) | Yes — before using Squarespace intake |
| `016_hard_delete_intake_rows.sql` | Deletes leftover dismissed and orphaned intake rows, and links accepted drafts to film orders with `ON DELETE CASCADE` | Yes — after 015, before relying on re-import after dismiss or delete |
| `017_displays.sql` | Creates `displays` (RLS on, no policies) and seeds `studio-vertical` | Yes — before using Displays or `/display/studio-vertical`. Safe to run again. |
| `018_film_menu.sql` | Creates `film_menus` (RLS on, no policies) and seeds the studio film menu | Yes — before using the Film menu screen. Safe to run again; it will not overwrite later edits. |
| `019_display_studio_bookings.sql` | Adds the studio-bookings switch and the guest info / checkout lines on `displays` (RLS stays on, no policies) | Yes — before using studio bookings on the screen. Safe to run again; it will not reset a switch or lines you have edited. |
| `020_add_order_hold_reason.sql` | Adds optional staff-only `hold_reason` on `film_orders` for the On Hold status | Yes — before relying on the On Hold reason. The status itself can be saved before this runs; the reason is skipped until the column exists. Safe to run again. |

## Notes

- Migration 002 only contains Justin's 6 test orders from development. Skip it if you want to start with a clean database.
- Real customer data comes from **Customers → Import from Sheet** once the app is live.
- If the schema ever needs to change, add a new file: `003_description.sql`
