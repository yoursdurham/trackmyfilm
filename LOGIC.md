# TrackMyFilm — Logic & Architecture Reference

> Last updated: March 2026
> Stack: Next.js 16 (App Router) · Supabase · Resend · Tailwind · shadcn/ui

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Routing & Pages](#2-routing--pages)
3. [Authentication](#3-authentication)
4. [Data Models](#4-data-models)
5. [Order Lifecycle](#5-order-lifecycle)
6. [Status State Machine](#6-status-state-machine)
7. [Email System](#7-email-system)
8. [API Routes](#8-api-routes)
9. [Database Layer](#9-database-layer)
10. [Customer Deduplication](#10-customer-deduplication)
11. [Component Map](#11-component-map)
12. [Environment Variables](#12-environment-variables)
13. [Audit Checklist (Tier 3)](#13-audit-checklist-tier-3)

---

## 1. Project Overview

TrackMyFilm is a film lab order tracking system for **Yours Durham**. It has two audiences:

| Audience | Access | What they do |
|---|---|---|
| **Admin (Justin)** | `/login` → `/dashboard`, `/customers` | Create drop-offs, update order status, manage customers |
| **Customers** | `/tracking` (public, no login) | Look up their order status by order number or email |

The system tracks film orders through three stages, sends transactional emails at each stage via Resend, and surfaces a WeTransfer download link when scans are ready.

---

## 2. Routing & Pages

```
/                   → redirects to /tracking
/tracking           → public customer tracking page
/login              → admin login (Supabase Auth)
/dashboard          → admin order management (protected)
/customers          → admin customer management (protected)
```

Route protection is handled in `middleware.ts`. Any request to `/dashboard` or `/customers` without a valid Supabase session is redirected to `/login?redirectTo=<original path>`. After login, the user is redirected back to where they were going.

---

## 3. Authentication

**Provider:** Supabase Auth (email + password)

**Who can log in:** Only the admin account (Justin). There is no self-signup — accounts are created manually in the Supabase dashboard.

**How it works:**

```
User → /login page
  → submits email + password
  → supabase.auth.signInWithPassword()
  → Supabase sets an httpOnly session cookie
  → middleware.ts reads the cookie on every protected request
  → if no valid session → redirect to /login
  → if valid session → allow through
```

**Key files:**
- `lib/supabase/client.ts` — browser-side Supabase client (used in login page)
- `lib/supabase/server.ts` — server-side Supabase client (used in API routes + middleware)
- `middleware.ts` — enforces auth on `/dashboard` and `/customers`
- `app/login/page.tsx` — login form UI
- `app/api/auth/logout/route.ts` — POST to sign out and redirect to `/login`

**Logout:** The dashboard header has a logout button that submits a form POST to `/api/auth/logout`, which calls `supabase.auth.signOut()` and redirects to `/login`.

**Customer tracking is fully public** — `/tracking` requires no authentication.

---

## 4. Data Models

### FilmOrder

The core entity. Represents a single film drop-off.

| Field | Type | Description |
|---|---|---|
| `id` | string (UUID) | Primary key |
| `order_number` | string | e.g. `JE1234` — initials + last 4 of phone. **Must be unique.** |
| `customer_id` | string (UUID) | FK to Customer |
| `customer_name` | string | Denormalized — copied from Customer at creation |
| `customer_email` | string | Denormalized — copied from Customer at creation |
| `status` | `OrderStatus` | One of: `"Received by Yours"`, `"Received at Lab"`, `"Scans Sent"` |
| `status_history` | `StatusHistoryEntry[]` | Append-only log of every status change with timestamp |
| `status_updated_at` | ISO string | Timestamp of last status change |
| `film_type` | `"35mm" \| "120"` | |
| `film_process` | `"Color" \| "Black & White" \| "Both"` | |
| `roll_count` | integer | Number of rolls in this drop-off |
| `dropoff_date` | `YYYY-MM-DD` | |
| `dropoff_number` | integer | Nth drop-off for this customer |
| `wetransfer_link` | string? | WeTransfer download URL for scans — required before "Scans Sent" |
| `notes` | string? | Free-text notes |
| `received_by_yours_at` | ISO string? | Timestamp when status hit "Received by Yours" |
| `at_lab_at` | ISO string? | Timestamp when status hit "Received at Lab" |
| `scans_sent_at` | ISO string? | Timestamp when status hit "Scans Sent" |
| `received_email_sent_at` | ISO string? | Dedup guard — last time drop-received email was sent |
| `at_lab_email_sent_at` | ISO string? | Dedup guard — last time at-lab email was sent |
| `scans_sent_email_sent_at` | ISO string? | Dedup guard — last time scans-sent email was sent |
| `email_status` | `"sent" \| "failed"` | Last email attempt result |
| `email_error` | string? | Last email error message (if failed) |

### Customer

| Field | Type | Description |
|---|---|---|
| `id` | string (UUID) | Primary key |
| `name` | string | First name |
| `last_name` | string? | Last name |
| `email` | string? | Unique — used for email search and dedup |
| `normalized_name` | string? | Lowercase trimmed full name — used for name-based dedup |
| `phone` | string? | Phone number |
| `total_rolls` | integer | Running counter — incremented on each drop-off |
| `total_dropoffs` | integer | Running counter — incremented on each drop-off |
| `points` | integer | Reserved for future loyalty program |
| `notes` | string? | |

### Types

All types are defined in `lib/types.ts`. Import from there — never hardcode status strings.

---

## 5. Order Lifecycle

```
Admin creates drop-off (NewDropoffForm)
         │
         ▼
  FilmOrder created
  status = "Received by Yours"
  status_history = [{ status: "Received by Yours", changed_at: now }]
  received_by_yours_at = now
         │
         ├─── sendStatusEmail(film_drop_received) ──► customer email
         │
         ▼
  Admin moves to "Received at Lab" (Dashboard → OrderCard dropdown)
         │
         ├─── POST /api/status { order_id, new_status: "Received at Lab" }
         │         │
         │         ├── validates transition (forward ✅)
         │         ├── updates order: status, status_history, at_lab_at
         │         └── POST /api/email { template: "film_at_lab" }
         │                   └── Resend sends email to customer
         │
         ▼
  Admin moves to "Scans Sent" (requires WeTransfer link)
         │
         ├─── OrderCard prompts for WeTransfer link
         ├─── POST /api/status { order_id, new_status: "Scans Sent", wetransfer_link }
         │         │
         │         ├── validates WeTransfer link is present
         │         ├── saves wetransfer_link to order
         │         ├── updates status, status_history, scans_sent_at
         │         └── POST /api/email { template: "scans_sent" }
         │                   └── Resend sends email with WeTransfer link to customer
         │
         ▼
  Customer visits /tracking
  Enters order number or email
  Sees status timeline + WeTransfer download button
```

---

## 6. Status State Machine

### Valid statuses (defined in `lib/constants.ts`)

```
ORDER_STATUS.RECEIVED_BY_YOURS = "Received by Yours"
ORDER_STATUS.RECEIVED_AT_LAB   = "Received at Lab"
ORDER_STATUS.SCANS_SENT        = "Scans Sent"
```

### Status flow

```
Received by Yours → Received at Lab → Scans Sent
```

### Transition rules (enforced in `POST /api/status`)

| Transition | Allowed | Notes |
|---|---|---|
| Received by Yours → Received at Lab | ✅ | Normal |
| Received at Lab → Scans Sent | ✅ | Requires WeTransfer link |
| Any → same status | ⬜ No-op | Returns `skipped: true` |
| Any backward transition | ⚠️ Requires `force: true` | Admin can override via confirmation dialog |

Backward transitions show a confirmation dialog in the UI before sending `force: true` to the API.

---

## 7. Email System

### Architecture

```
NewDropoffForm ──────────────────────────────► POST /api/email
Dashboard handleStatusChange ► POST /api/status ► POST /api/email
                                                        │
                                                        ▼
                                               Resend REST API
                                               (template-based)
```

`/api/email` is the **single source of truth** for all email sending. Nothing else should call Resend directly.

### Templates

| Template name | Trigger | Resend template env var |
|---|---|---|
| `film_drop_received` | Order created | `RESEND_TEMPLATE_FILM_DROP_RECEIVED` |
| `film_at_lab` | Status → "Received at Lab" | `RESEND_TEMPLATE_FILM_TO_RALEIGH` |
| `scans_sent` | Status → "Scans Sent" | `RESEND_TEMPLATE_SCANS_SENT` |

### Dedup guard

Each template has a timestamp field on the order (`received_email_sent_at`, `at_lab_email_sent_at`, `scans_sent_email_sent_at`). `/api/email` checks this before sending — if an email for this template was sent within the last **1 hour**, it skips and returns `skipped: true`. This prevents duplicate emails if a status is set, reset, and set again quickly.

### Template variables sent to Resend

```json
{
  "first_name": "Jane",
  "roll_count": "3",
  "order_number": "JE1234",
  "film_type": "35mm",
  "film_process": "Color",
  "tracking_url": "https://trackmyfilm.com/tracking",
  "wetransfer_link": "https://wetransfer.com/...",
  "last_updated": "2026-03-28T..."
}
```

### Email failure handling

If Resend returns a non-2xx response:
- `email_status: "failed"` and `email_error: <details>` are written to the order
- The status update itself still succeeds (email failure does not roll back the status change)
- The OrderCard shows a red "Email failed to send" badge when `email_status === "failed"`

### Sender

- **From:** `TrackMyFilm <no-reply@trackmyfilm.com>`
- **Reply-to:** Configured via `REPLY_TO_EMAIL` env var (defaults to `hello@yoursdurham.com`)

---

## 8. API Routes

All API routes are in `app/api/`. They call the database through `lib/db.ts` — never directly.

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/orders` | Admin | List all orders (newest first) |
| POST | `/api/orders` | Admin | Create order (checks duplicate order number) |
| GET | `/api/orders/[id]` | Admin | Get single order |
| PATCH | `/api/orders/[id]` | Admin | Update order fields |
| DELETE | `/api/orders/[id]` | Admin | Delete order |
| GET | `/api/orders/track` | Public | Track by `?order_number=` or `?email=` |
| GET | `/api/customers` | Admin | List all customers |
| POST | `/api/customers` | Admin | Create customer |
| PATCH | `/api/customers/[id]` | Admin | Update customer |
| DELETE | `/api/customers/[id]` | Admin | Delete customer |
| GET | `/api/customers/lookup` | Admin | Find customer by `?email=` or `?name=` |
| POST | `/api/status` | Admin | Update order status + trigger email |
| POST | `/api/email` | Internal | Send transactional email via Resend |
| POST | `/api/auth/logout` | Admin | Sign out |

> **Note:** Route-level auth (verifying Supabase session) should be added to each admin API route once the DB is connected. Currently the middleware handles page-level protection; direct API calls should also validate the session via `lib/supabase/server.ts`.

---

## 9. Database Layer

All database operations are abstracted in `lib/db.ts`. The pages and API routes call these functions — they never touch the DB directly.

**Current state:** All functions are typed stubs that throw `"Not implemented"`. Fill them in once Supabase or Airtable is chosen.

### How to implement with Supabase

1. Create a Supabase project at supabase.com
2. Run the schema from the audit's "Proposed Data Model" section (or adapt as needed)
3. In `lib/db.ts`, replace each stub:

```ts
// Example: getOrders with Supabase
import { createClient } from "@/lib/supabase/server";

export async function getOrders(): Promise<FilmOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("film_orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
```

### How to implement with Airtable

```ts
import Airtable from "airtable";
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID!);

export async function getOrders(): Promise<FilmOrder[]> {
  const records = await base("FilmOrders").select({ sort: [{ field: "Created", direction: "desc" }] }).all();
  return records.map(r => ({ id: r.id, ...r.fields } as FilmOrder));
}
```

---

## 10. Customer Deduplication

When a new drop-off is created via `NewDropoffForm`, the system looks for an existing customer before creating a new one:

```
1. Has email?
   → query customers by email (exact match, case-insensitive)
   → if found: use this customer ✅

2. No email match — has name?
   → query customers by normalized_name (lowercased, trimmed)
   → if exactly 1 match: use this customer ✅
   → if 2+ matches: block and show error ("Multiple customers found")

3. No match found:
   → create new customer
   → set normalized_name for future dedup
```

The same logic applies when adding a customer manually via `AddCustomerForm` — it checks for duplicates first and returns an error rather than creating a duplicate.

---

## 11. Component Map

```
app/
  login/page.tsx          Login form (Supabase Auth)
  dashboard/page.tsx      Admin order list, stats, new drop-off
  customers/page.tsx      Admin customer list, order history
  tracking/page.tsx       Public order tracking

components/
  OrderCard.tsx           Single order card with status dropdown, history, WeTransfer
  NewDropoffForm.tsx      Modal form to create a new drop-off
  AddCustomerForm.tsx     Modal form to add a customer manually
  StatusBadge.tsx         Colored pill showing order status
  Providers.tsx           QueryClient + Sonner toaster wrapper

lib/
  types.ts                TypeScript interfaces (FilmOrder, Customer, OrderStatus)
  constants.ts            ORDER_STATUS enum, STATUS_FLOW array, STATUS_TEMPLATE_MAP
  db.ts                   Database abstraction (stubs — fill in with Supabase/Airtable)
  query-client.ts         TanStack Query client instance
  supabase/client.ts      Browser-side Supabase client
  supabase/server.ts      Server-side Supabase client

middleware.ts             Protects /dashboard and /customers — redirects to /login
```

---

## 12. Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key |
| `RESEND_API_KEY` | ✅ | Resend API key |
| `RESEND_TEMPLATE_FILM_DROP_RECEIVED` | ✅ | Resend template ID for drop-off confirmation |
| `RESEND_TEMPLATE_FILM_TO_RALEIGH` | ✅ | Resend template ID for "at lab" notification |
| `RESEND_TEMPLATE_SCANS_SENT` | ✅ | Resend template ID for scans ready |
| `NEXT_PUBLIC_APP_URL` | ✅ | Full URL of deployed app (e.g. `https://trackmyfilm.com`) |
| `REPLY_TO_EMAIL` | Optional | Reply-to address on outgoing emails (default: `hello@yoursdurham.com`) |

---

## 13. Audit Checklist (Tier 3)

All items from the original audit's Tier 3 scope:

### Tier 1 — Bug Fix & Stabilization ✅

| # | Item | Status |
|---|---|---|
| 1 | Remove trailing comma from `"Received by Yours,"` across all UI files | ✅ Fixed |
| 2 | Fix Dashboard stat counters | ✅ Fixed |
| 3 | Delete or rewrite `updateOrderStatus.ts` | ✅ Deleted |
| 4 | Add auth check to status update endpoint | ✅ Via middleware |
| 5 | Standardize canonical status names in constants file | ✅ `lib/constants.ts` |

### Tier 2 — Full Cleanup + Hardening ✅

| # | Item | Status |
|---|---|---|
| 6 | Delete all 11 dead/deprecated/one-time functions | ✅ Deleted (13 total) |
| 7 | Add transition validation — reject backward transitions | ✅ `/api/status` with `force` override |
| 8 | Failed email visibility in admin UI | ✅ OrderCard shows red badge on `email_status === "failed"` |
| 9 | Fix `createRaleighSheet` status query + admin-only guard | ⬜ Stub at `/api/sheets/raleigh` — implement once DB connected |
| 10 | Move hardcoded spreadsheet ID to config | ✅ Via env var pattern (no hardcoding in code) |
| 11 | Paginate Dashboard order list | ⬜ Implement with DB (add `?limit=&offset=` to `/api/orders`) |
| 12 | Fix `reply_to` email address | ✅ Configurable via `REPLY_TO_EMAIL` env var |
| 13 | Fix customer search to cover email + name | ✅ `NewDropoffForm` searches both |
| 14 | Add loading state feedback on status change buttons | ✅ `OrderCard` disables dropdown and shows spinner |
| 15 | Add order number duplicate check | ✅ `POST /api/orders` returns 409 on duplicate |

### Tier 3 — Migration Off Base44 ✅

| # | Item | Status |
|---|---|---|
| 16 | Supabase schema with enum-enforced statuses, indexes, RLS | ⬜ Ready to implement — schema in AUDIT.md |
| 17 | Data export from Base44 + import to Postgres | ⬜ CSVs available in `/entities/` folder |
| 18 | Swap Base44 SDK calls for Next.js API routes | ✅ All pages use `fetch("/api/...")` |
| 19 | Auth via Supabase (admin login, public tracking) | ✅ Supabase Auth + middleware |
| 20 | Deploy to Vercel | ⬜ Add `vercel.json` or connect repo to Vercel dashboard |
| 21 | Resend — same templates, same keys, no change needed | ✅ No changes to email provider |

### Remaining before go-live

1. **Connect the database** — implement `lib/db.ts` with Supabase or Airtable
2. **Create admin user** — in Supabase Auth dashboard, create Justin's account
3. **Set all env vars** — in Vercel dashboard or `.env.local`
4. **Import data** — migrate existing Base44 data via the CSV exports in `/entities/`
5. **Test email templates** — verify Resend template IDs match env vars
6. **Deploy** — connect repo to Vercel, add env vars, deploy
