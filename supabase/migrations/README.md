# Database Migrations

Run these in order in: **Supabase Dashboard → SQL Editor → New Query**

| File | What it does | Required |
|---|---|---|
| `001_initial_schema.sql` | Creates tables, indexes, RLS | Yes — run first |
| `002_import_base44_data.sql` | Imports test data from Base44 exports | Optional — dev/reference only |

## Notes

- Migration 002 only contains Justin's 6 test orders from development. Skip it if you want to start with a clean database.
- Real customer data comes from **Customers → Import from Sheet** once the app is live.
- If the schema ever needs to change, add a new file: `003_description.sql`
