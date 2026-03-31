# TrackMyFilm

Film lab order tracking system for **Yours Durham**.

Customers track their film orders at `/tracking`. Justin manages drop-offs and order status at `/dashboard`.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | Supabase (Postgres) _or_ Airtable — TBD |
| Email | Resend |
| Auth | Supabase Auth |
| UI | Tailwind CSS + shadcn/ui |
| Hosting | Vercel |

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` with your Supabase project URL/keys, Resend API key, and template IDs.

### 3. Connect the database

All database calls are stubbed in `lib/db.ts` with `// TODO` comments. Implement each function using Supabase or Airtable — see [LOGIC.md](./LOGIC.md#9-database-layer) for examples.

### 4. Create the admin account

In the Supabase dashboard: **Authentication → Users → Add user**. Add Justin's email + password. That's the only account that needs to exist.

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The root URL redirects to `/tracking` (public). Go to `/login` to access the admin dashboard.

---

## Pages

| URL | Access | Description |
|---|---|---|
| `/tracking` | Public | Customer order lookup by order number or email |
| `/login` | Public | Admin sign-in |
| `/dashboard` | Admin only | Order management — create drop-offs, update status |
| `/customers` | Admin only | Customer list with order history |

---

## Architecture

See [LOGIC.md](./LOGIC.md) for the full logic reference — order lifecycle, email system, status state machine, API routes, and the complete audit checklist.

---

## Remaining before go-live

1. Implement `lib/db.ts` with chosen database (Supabase or Airtable)
2. Set all environment variables in Vercel
3. Create admin user in Supabase Auth
4. Import existing customer/order data from Base44 CSV exports (`/entities/`)
5. Verify Resend template IDs
6. Deploy to Vercel
