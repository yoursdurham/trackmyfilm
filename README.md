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
