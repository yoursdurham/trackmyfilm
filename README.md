# TrackMyFilm

Film lab order tracking system for **Yours Durham**. Built with Next.js 16, Supabase, and Resend.

## What it does

- Staff log in and manage film drop-offs through a 3-step status flow
- Order status lookup is also behind login (`/tracking`)
- Transactional emails fire automatically at each status change via Resend

---

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Already configured in `.env`. If starting fresh, copy `.env.example`:

```bash
cp .env.example .env
```

Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional (needed for emails):
- `RESEND_API_KEY` + three template IDs

Optional (needed for the Squarespace incoming queue):
- `SQUARESPACE_INTAKE_SECRET` — bearer token for the assistant that stages drop-offs

The assistant calls `POST /api/incoming-drafts` with `Authorization: Bearer <SQUARESPACE_INTAKE_SECRET>`. That creates a **Pending Intake** item only. It does not create a film order, set Received by Yours, write received status history, or send the drop-off email. Logged-in staff click **Approve & Receive** when the film arrives. That sets Received by Yours, the received timestamp, normal status history, and sends the confirmation email unless the checkbox is off.

Set the secret in Vercel and in local `.env`. Do not commit it (`.env*` is gitignored), and do not use a `NEXT_PUBLIC_` name.

Example body (35mm C41, High-Res, 4x6 prints, Portra 800, 1 roll):

```json
{
  "squarespace_order_number": "01050",
  "external_order_id": "squarespace-01050",
  "import_source": "squarespace",
  "customer_name": "Justin Eisner",
  "customer_email": "contact@justineisner.com",
  "roll_count": 1,
  "roll_details": [
    {
      "film_type": "35mm",
      "film_process": "C41",
      "scan_size": "High-Res",
      "prints_4x6": true,
      "film_stock": "Kodak Portra 800"
    }
  ]
}
```

`C41` is stored as Color. `film_stock` is optional. `scan_size` may be `Standard` or `High-Res` (also `TIFF` or `Process Only`). Send `squarespace_order_number` as a string so leading zeros in `01050` are kept. Duplicate order numbers and duplicate `external_order_id` values are rejected, including order numbers that already exist as film orders.

**Dismiss** deletes the Pending Intake row. Deleting a film order also deletes the matching intake row (same order number or Squarespace external id). Neither action leaves a row behind, so that Squarespace order can be imported again.

Before using the queue, run `supabase/migrations/015_incoming_squarespace_drafts.sql` in the Supabase SQL editor, then `supabase/migrations/016_hard_delete_intake_rows.sql`. See `supabase/migrations/README.md`.

### 3. Database

Run both migration files in **Supabase Dashboard → SQL Editor**:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_import_base44_data.sql`

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → redirects to login.

---

## Pages

| URL | Access | Description |
|---|---|---|
| `/login` | Public | Sign in |
| `/login/update-password` | Public | Password reset (via email link) |
| `/dashboard` | Login required | Manage film orders |
| `/customers` | Login required | Manage customers |
| `/tracking` | Login required | Order status lookup |

## Scripts

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm test         # Run unit tests (46 tests)
```

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Email | Resend |
| UI | Tailwind CSS + shadcn/ui (Base UI) |
| Data fetching | TanStack Query v5 |
| Testing | Vitest |
| Hosting | Vercel |

---

## Project structure

```
app/                  Pages + API routes
components/           UI components
lib/
  db.ts               All Supabase queries
  validation.ts       Business logic (pure functions)
  constants.ts        Status flow + template map
  types.ts            TypeScript types
  api-auth.ts         requireAuth() helper for API routes
  supabase/           Supabase clients (browser + server)
proxy.ts              Auth middleware (route protection)
supabase/migrations/  SQL migration files
__tests__/            Unit tests
```

See [LOGIC.md](./LOGIC.md) for full architecture documentation.

---

## Remaining before go-live

1. Set up Resend — create 3 email templates, add template IDs to `.env`
2. Set all env vars in Vercel dashboard
3. Deploy to Vercel
