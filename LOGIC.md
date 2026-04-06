# TrackMyFilm — Logic & Architecture

> Last updated: March 2026
> Stack: Next.js 16 (App Router) · Supabase · Resend · Tailwind · shadcn/ui (Base UI)

---

## Overview

TrackMyFilm is a film lab order tracking system for **Yours Durham**. Everything is behind login — staff manage orders and customers, and can also look up order status from the tracking page.

| Page | Auth | Purpose |
|---|---|---|
| `/dashboard` | Required | Create drop-offs, update order status |
| `/customers` | Required | Manage customers, view order history |
| `/tracking` | Required | Look up order status by order # or email |
| `/login` | Public | Sign in |
| `/login/update-password` | Public | Set new password via reset link |

---

## Auth

- **Provider:** Supabase Auth (email + password)
- **Session:** Cookie-based via `@supabase/ssr`, auto-refreshed by middleware on every request
- **Protection:** `proxy.ts` (Next.js middleware) guards `/dashboard`, `/customers`, `/tracking` — unauthenticated users are redirected to `/login?redirectTo=<path>`
- **Forgot password:** "Forgot password?" on login page → sends reset email → `/login/update-password` to set new password
- **Logout:** POST `/api/auth/logout` → clears session → back to `/login`
- **One admin user:** `hello@yoursdurham.com`

Key files: `proxy.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/api-auth.ts`

All API routes also call `requireAuth()` server-side — so even direct API calls without a browser session are rejected with 401.

---

## Status Flow

Orders move through exactly 3 statuses in order:

```
Received by Yours → Received at Lab → Scans Sent
```

- **Forward** transitions are always allowed
- **Backward** transitions require admin confirmation (UI shows dialog, sends `force: true` to API)
- **Same status** is a no-op — returns `skipped: true`
- **Scans Sent** requires a WeTransfer link before the transition is allowed

Defined in `lib/constants.ts` as `STATUS_FLOW`.

---

## Order Lifecycle

```
Admin creates drop-off (NewDropoffForm)
  → looks up existing customer by email or name
  → creates customer if not found
  → creates film_order (status = "Received by Yours")
  → updates customer total_rolls + total_dropoffs
  → fires confirmation email via /api/email

Admin updates status → /api/status
  → validates transition
  → updates order + status_history
  → fires status email via /api/email

Customer visits /tracking (login required)
  → searches by order number or email
  → sees status timeline + WeTransfer download button
```

---

## Email System

`/api/email` is the single source of truth for all email sending.

| Template key | Trigger | Env var |
|---|---|---|
| `film_drop_received` | Drop-off created | `RESEND_TEMPLATE_FILM_DROP_RECEIVED` |
| `film_at_lab` | Status → Received at Lab | `RESEND_TEMPLATE_FILM_TO_RALEIGH` |
| `scans_sent` | Status → Scans Sent | `RESEND_TEMPLATE_SCANS_SENT` |

**Dedup:** Per-order timestamp fields (`received_email_sent_at`, `at_lab_email_sent_at`, `scans_sent_email_sent_at`) prevent duplicate emails within 1 hour.

**Email failure:** Does not fail the status update. `email_status: "failed"` is recorded on the order and shown as a red badge in the OrderCard.

**Variables sent to Resend:** `first_name`, `order_number`, `roll_count`, `film_type`, `film_process`, `tracking_url`, `wetransfer_link`, `last_updated`

**From:** `TrackMyFilm <no-reply@trackmyfilm.com>`
**Reply-to:** `REPLY_TO_EMAIL` env var (default: `hello@yoursdurham.com`)

---

## API Routes

All routes require auth. Exception: `/api/orders/track` is intentionally public (customer-facing tracking lookup).

| Method | Route | Description |
|---|---|---|
| GET | `/api/orders` | List all orders (newest first) |
| POST | `/api/orders` | Create order (409 on duplicate order number) |
| GET | `/api/orders/[id]` | Get single order |
| PATCH | `/api/orders/[id]` | Update order fields |
| DELETE | `/api/orders/[id]` | Delete order |
| GET | `/api/orders/track` | Track by `?order_number=` or `?email=` |
| POST | `/api/status` | Update status + trigger email |
| POST | `/api/email` | Send transactional email via Resend |
| GET | `/api/customers` | List all customers |
| POST | `/api/customers` | Create customer |
| PATCH | `/api/customers/[id]` | Update customer |
| DELETE | `/api/customers/[id]` | Delete customer |
| GET | `/api/customers/lookup` | Find customer by `?email=` or `?name=` |
| POST | `/api/auth/logout` | Sign out |

---

## Database (Supabase)

Two tables. API routes use `SUPABASE_SERVICE_ROLE_KEY` server-side (bypasses RLS). RLS is enabled on both tables to block any accidental direct browser access.

### customers
`id`, `name`, `last_name`, `email`, `phone`, `normalized_name`, `notes`, `wetransfer_link`, `total_rolls`, `total_dropoffs`, `points`, `created_at`

### film_orders
`id`, `customer_id` (FK), `customer_name`, `customer_email`, `order_number` (unique), `dropoff_date`, `roll_count`, `film_type`, `film_process`, `dropoff_number`, `status`, `status_history` (jsonb), `status_updated_at`, `received_by_yours_at`, `at_lab_at`, `scans_sent_at`, `wetransfer_link`, `notes`, `email_status`, `email_error`, `received_email_sent_at`, `at_lab_email_sent_at`, `scans_sent_email_sent_at`, `created_at`

Migrations are in `supabase/migrations/`.

---

## Customer Deduplication

When creating a drop-off, the system finds or creates a customer:

1. Search by email (case-insensitive exact match) → if found, use it
2. Search by `normalized_name` → if exactly 1 match, use it
3. No match → create new customer

`normalized_name` = lowercased, trimmed, collapsed whitespace full name (from `lib/validation.ts`).

---

## Validation (`lib/validation.ts`)

Single source of truth for all business logic — imported by both API routes and components:

| Function | Purpose |
|---|---|
| `isValidTransition(current, next)` | Forward-only status flow check |
| `isKnownStatus(status)` | Type guard for valid statuses |
| `isWithinDedupWindow(lastSentAt)` | 1-hour email dedup check |
| `normalizeEmail(email)` | trim + lowercase |
| `normalizeCustomerName(name)` | trim + collapse spaces + lowercase |
| `normalizeOrderNumber(num)` | trim + uppercase |
| `isValidWetransferLink(url)` | Hostname check — must be `wetransfer.com` |
| `ensureHttps(url)` | Prepends `https://` if missing |

---

## Key Files

```
proxy.ts                            Auth middleware
lib/
  db.ts                             All Supabase queries
  validation.ts                     Pure business logic
  constants.ts                      STATUS_FLOW, STATUS_TEMPLATE_MAP
  types.ts                          TypeScript types
  api-auth.ts                       requireAuth() helper
  supabase/client.ts                Browser Supabase client
  supabase/server.ts                Server Supabase client (SSR)
app/
  login/page.tsx                    Login + forgot password
  login/update-password/page.tsx    Password reset
  dashboard/page.tsx                Admin dashboard
  customers/page.tsx                Customer management
  tracking/page.tsx                 Order lookup
  api/...                           All API routes
components/
  OrderCard.tsx                     Order card with status controls
  NewDropoffForm.tsx                New drop-off dialog
  AddCustomerForm.tsx               Add customer dialog
  StatusBadge.tsx                   Status pill badge
supabase/migrations/
  001_initial_schema.sql            Creates tables + indexes
  002_import_base44_data.sql        Imports Base44 test data
__tests__/
  validation.test.ts                Unit tests (46 total)
  constants.test.ts
  utils.test.ts
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (server only, bypasses RLS) |
| `RESEND_API_KEY` | For emails | Resend API key |
| `RESEND_TEMPLATE_FILM_DROP_RECEIVED` | For emails | Resend template ID |
| `RESEND_TEMPLATE_FILM_TO_RALEIGH` | For emails | Resend template ID |
| `RESEND_TEMPLATE_SCANS_SENT` | For emails | Resend template ID |
| `NEXT_PUBLIC_APP_URL` | For emails | Full app URL (used in email links) |
| `REPLY_TO_EMAIL` | Optional | Reply-to on outgoing emails |
