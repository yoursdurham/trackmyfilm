# TrackMyFilm — Owner Guide & Documentation

> Last updated: October 2026
> 

---

## How to Log In

Go to **trackmyfilm.com** and sign in


**Forgot your password?**
Click "Forgot password?" on the login page → enter your email → check `hello@yoursdurham.com` for a reset link → click it → set a new password. You'll be redirected to the dashboard automatically.

---

## The Three Pages

### 1. Dashboard (`/dashboard`)
The main page. Every film order appears as a card.
- Filter orders by status using the tabs at the top
- Search by customer name or order number
- Click **New Drop-off** to log a new order
- **Pending Intake** lists Squarespace orders that have been imported but not received yet. No confirmation email goes out at import. **Check Squarespace** pulls store orders placed in the last 7 days and adds film-processing ones that are not already in the system. An order only counts if it was placed in those 7 days, not merely edited or fulfilled then. In-person Point of Sale orders are skipped. `01050` and `1050` count as the same order number. When the film is in hand, click **Approve & Receive** (leave “Send confirmation email” checked unless you want to skip it). That marks the order Received by Yours and sends the usual email. **Dismiss** deletes that intake row. A later check can import that Squarespace order again when it was placed in the last 7 days. Deleting a film order also deletes a matching intake row. Edit first if a detail needs correcting. Dismiss and delete do not remove other drafts or film orders.
- Click **Update Status** on any card to advance the order, or choose **On Hold** to park it

### 2. Customers (`/customers`)
A full table of all 529+ customers.
- Search by name, email, or order number
- Click any row to expand it and edit their details inline
- All edits save automatically when you press Enter or click away
- Delete a customer using the button in the expanded row

### 3. Tracking (`/tracking`)
What customers see when they look up their order. They enter their order number or email address and see the current status and timeline.

---

## The Full Workflow — Step by Step

### Step 1 — Customer drops off film
Click **New Drop-off** on the dashboard. Fill in:
- Customer name and email
- Order number (e.g. `JE1234`)
- Drop-off date
- Number of rolls
- Film type (35mm or 120)
- Film process (Color, Black & White, or Both)
- Film stock (optional)
- Notes (optional — internal only, never shown to customers)

The system will automatically:
- Find the customer if they already exist (matched by email first, then name)
- Create a new customer record if they're new
- Log the order with status **"Received by Yours"**
- Send a confirmation email to the customer

> **Email toggle:** A checkbox at the bottom of the form says "Send confirmation email." It is on by default. Uncheck it if you don't want to send an email for a specific drop-off (e.g. if the customer has no email, or you're logging an old order).

---

### Step 2 — Drive film to the lab in Raleigh
Find the order card on the dashboard. Click **Update Status → Received at Lab**.

The system will:
- Update the order status
- Send the customer an email saying their film has arrived at the lab

---

### Step 3 — Lab sends scans back
When you receive the WeTransfer link from the lab, click **Update Status → Scans Sent** on the order card.

A box will appear asking you to paste the WeTransfer download link. Once confirmed:
- The link is saved permanently to the order
- The customer receives an email with their download link
- The order card shows **Copy link** and **Open** buttons for your reference

> The WeTransfer link is stored in the database forever. You can always go back to the order card to copy or open it later.

---

## Emails — What Gets Sent and When

There are exactly 3 customer emails, one per pipeline status. **On Hold does not send an email.**

| Status | Email | When it sends |
|--------|-------|--------------|
| Received by Yours | Confirmation | Automatically when drop-off is logged |
| Received at Lab | Lab update | When you click "Update Status → Received at Lab" |
| Scans Sent | Download link | When you click "Update Status → Scans Sent" and paste WeTransfer link |
| On Hold | None | Parking an order never emails the customer |

**No email is sent if:**
- The customer has no email address on file
- The "Send confirmation email" checkbox was unchecked when logging the drop-off

**If an email fails:** A red "⚠️ Email failed to send" banner appears on the order card with a **Retry** button. Click it to try again.

---

## Customizing Email Templates

All 3 email templates are managed entirely in your **Resend dashboard** at resend.com. Log in → Templates. You can change anything about them without touching any code.

### What you can freely change
- Subject line
- Body text, wording, tone
- Layout and design
- Logo, colors, fonts
- Any static content (turnaround times, store hours, policies, etc.)

### Variables — do not rename these
The system automatically fills in these placeholders when sending. The names must stay exactly as written:

| Variable | What it inserts |
|----------|----------------|
| `{{first_name}}` | Customer's first name (e.g. "Sarah") |
| `{{order_number}}` | The order number (e.g. "JE1234") |
| `{{roll_count}}` | Number of rolls (e.g. "3") |
| `{{notes}}` | Drop-off notes from the New Film Drop-off form (film_drop_received only; empty if none) |
| `{{wetransfer_link}}` | The WeTransfer download URL (scans_sent email only) |
| `{{scan_notes}}` | Plain-text note from the lab (scans_sent only; empty if none) |
| `{{scan_notes_html}}` | Same note as HTML paragraph (scans_sent only; empty if none — paste this in HTML templates) |

> If you rename a variable — for example changing `{{first_name}}` to `{{name}}` — the email will send with the literal text `{{name}}` showing instead of the customer's actual name. Don't rename them; only change the text around them.

---

### The `scans_sent` Template — Important

This template **must include `{{wetransfer_link}}`** somewhere in the body, otherwise customers won't receive their download link. Here is a complete example you can use as a starting point:

---

**Subject:** Your scans are ready — download here!

**Body:**
```
Hey {{first_name}}!

Great news — your scans for order #{{order_number}} ({{roll_count}} rolls) are ready.

Download your scans here:
{{wetransfer_link}}

{{scan_notes_html}}

The link expires after 7 days so download soon.

Your negatives are being held at our Durham store for 60 days after processing. If you'd like them back, just reply to this email or stop by.

Thanks for developing with us!
— The Yours Durham team
```

---

Feel free to change the wording completely. Just keep `{{wetransfer_link}}` in there so the link comes through.

**After editing:** Click **Publish** in the Resend template editor. Templates in "Draft" status will not send to customers.

### Suggested subject lines

| Template | Suggested subject |
|----------|------------------|
| `film_drop_received` | We've got your film! |
| `film_at_lab` | Your film is at the lab |
| `scans_sent` | Your scans are ready — download here! |

---

## What You Can Change (Summary)

| What | Where |
|------|-------|
| Email content, subject, design | Resend dashboard → Templates |
| Customer details (name, email, notes, rolls) | Customers page → click any row |
| Order status | Dashboard → card → Update Status |
| Park an order, with an optional reason | Dashboard → card → Update Status → On Hold |
| WeTransfer link on an order | Dashboard → card → Update Status → Scans Sent |
| Password | Login page → Forgot password |

---

## What You Cannot Change (Without a Developer)

- The pipeline order — Received by Yours → Lab → Ready for Pickup or Scans Sent. On Hold is a parking status outside that line
- Showing the On Hold reason to customers — the tracking page only says we're checking on the order
- The WeTransfer link validation (only accepts wetransfer.com links)
- The login email — only `hello@yoursdurham.com` has access
- The tracking page design

---

## The Customer Table — Column Reference

| Column | What it means |
|--------|--------------|
| Email | Used for sending emails and finding existing customers |
| First Name | First name only — do not put full name here |
| Last Name | Last name only |
| Date | Date of their most recent drop-off |
| Order # | Most recent order number |
| Current Rolls | Rolls in the most recent drop-off |
| Total Rolls | All rolls across every drop-off ever |
| Drop-off Count | Total number of drop-offs from this customer |

---

## Customer Deduplication — How It Works

When logging a new drop-off, the system finds or creates the customer automatically:

1. Searches by **email** first (exact match, case-insensitive)
2. If no email match, searches by **name** (case-insensitive, ignores extra spaces)
3. If no match found → creates a new customer

This means:
- "John Smith" and "john smith" are treated as the same person
- "Jon Smith" and "John Smith" are treated as **different** people
- Always enter the customer's email when possible — it's the most reliable way to avoid duplicates

---

## The WeTransfer Link

When you update an order to "Scans Sent" and paste the WeTransfer link:
- It is **saved permanently** to the order in the database
- It is **sent in the email** to the customer automatically
- It appears as **Copy link / Open** buttons on the order card
- It can be accessed any time from the Customers page → expand a customer → order history

> WeTransfer links expire after 7 days. If a customer misses it, you can copy the link from the order card and send it manually — but if the WeTransfer itself has expired, you'll need to contact the lab for a new one.

---

## Frequently Asked Questions

**What if I log a drop-off with the wrong order number?**
Delete the order using the trash icon on the card, then re-create it with the correct number. Order numbers must be unique — duplicates are rejected.

**What if a customer has no email?**
The drop-off is still logged. No email will be sent. You can add their email later on the Customers page, but it won't send any previously missed emails.

**Can two customers have the same name?**
Yes — if they have different email addresses they'll be kept as separate records. If they have the same name and no email, the system treats them as one person. Use the Notes field to distinguish them.

**What if the email fails and Retry doesn't work?**
Contact your developer. The most common cause is the sending domain not being verified in Resend.

**Can I change the tracking page design?**
Not without a developer — it's part of the app code.

**How do I change the password?**
Go to the login page → click "Forgot password?" → enter `hello@yoursdurham.com` → check your email for the reset link.

---

## Developer Notes (Daniel)

### Vercel — Environment Variables
All of these must be set in **Vercel → Project → Settings → Environment Variables**:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | From Supabase project settings |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase project settings |
| `RESEND_API_KEY` | From Resend dashboard |
| `RESEND_FROM_EMAIL` | `Yours Durham <no-reply@trackmyfilm.com>` |
| `RESEND_TEMPLATE_FILM_DROP_RECEIVED` | `42f3637c-6e35-4229-bf5e-cf212180d9ef` |
| `RESEND_TEMPLATE_FILM_AT_LAB` | `b11e69ed-486d-4b7e-9eb3-0209e3baea91` |
| `RESEND_TEMPLATE_SCANS_SENT` | `9a4f158b-0edd-425d-967e-3da8004bb978` |
| `NEXT_PUBLIC_APP_URL` | `https://trackmyfilm.com` |
| `REPLY_TO_EMAIL` | `hello@yoursdurham.com` |
| `NEXT_PUBLIC_CONTACT_EMAIL` | `hello@yoursdurham.com` |
| `SQUARESPACE_INTAKE_SECRET` | Long random secret for the Squarespace assistant. Set it in Vercel only — do not commit it. The assistant sends `Authorization: Bearer <this value>` to `POST /api/incoming-drafts`. |
| `SQUARESPACE_API_KEY` | Squarespace Commerce API key with Orders read. Set it in Vercel only — do not commit it and do not use a `NEXT_PUBLIC_` name. **Check Squarespace** uses it. |

### Squarespace incoming queue

1. In **Supabase Dashboard → SQL Editor → New Query**, run `supabase/migrations/015_incoming_squarespace_drafts.sql`, then `supabase/migrations/016_hard_delete_intake_rows.sql`.
2. Set `SQUARESPACE_INTAKE_SECRET` in Vercel (and in local `.env` if you are testing the assistant).
3. The assistant creates Pending Intake items only. Approve & Receive is what creates the real order and sends the drop-off email. **Check Squarespace** can also create Pending Intake items from the Squarespace Orders API when `SQUARESPACE_API_KEY` is set. It only brings in orders placed in the last 7 days. Dismiss deletes the intake row. Deleting a film order deletes a matching intake row. Hand-entered drop-offs are unchanged. Already-imported drafts and film orders are left in place.

### Custom Domain
- Vercel: `trackmyfilm.com` — A record pointing to `76.76.21.21`, CNAME `www` → `cname.vercel-dns.com`
- Resend: `trackmyfilm.com` already verified (DKIM + SPF both green)

---

## Workflow Summary

```
Customer drops off film
        ↓
Log new drop-off → Status: "Received by Yours" → Email 1 sent
        ↓
Drive film to Raleigh → Update Status: "Received at Lab" → Email 2 sent
        ↓
Lab sends WeTransfer link → Update Status: "Scans Sent" → paste link → Email 3 sent with download link
```
