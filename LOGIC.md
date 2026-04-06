# TrackMyFilm — Owner Guide

> Last updated: April 2026

---

## What is this?

TrackMyFilm is a private system for **Yours Durham** to track film orders from drop-off to delivery. Customers can check the status of their film online. You log in as staff to manage everything.

---

## How to Log In

Go to your app URL and sign in with:

- **Email:** `hello@yoursdurham.com`
- **Password:** `YoursDurham2026!`

If you ever forget the password, click **"Forgot password?"** on the login page and a reset link will be sent to `hello@yoursdurham.com`.

---

## The Three Pages

### 1. Dashboard (`/dashboard`)
This is the main page. It shows every film order as a card.

- You can filter by status (Received by Yours / Received at Lab / Scans Sent)
- You can search by customer name or order number
- Click **New Drop-off** to log a new film order

### 2. Customers (`/customers`)
A full list of all 529+ customers imported from your spreadsheet.

- Search by name, email, or order number
- Click any row to expand it and edit their details
- All edits save automatically when you press Enter or click away

### 3. Tracking (`/tracking`)
Customers use this to look up the status of their film by entering their order number or email address.

---

## The Full Workflow — Step by Step

### Step 1 — Customer drops off film
You open the dashboard and click **New Drop-off**. Fill in:
- Customer name and email
- Order number (e.g. `JE1234`)
- Drop-off date
- Number of rolls
- Film type (35mm or 120)
- Film process (Color, Black & White, or Both)
- Film stock (optional)
- Notes (optional, internal only — not shown to customer)

The system will:
- Find the customer if they already exist (by email or name)
- Create a new customer record if they don't
- Log the order with status **"Received by Yours"**
- Send the customer a confirmation email automatically

> **Email toggle:** There is a checkbox at the bottom of the form — "Send confirmation email". It is on by default. Uncheck it if you do not want to send an email for a particular drop-off.

---

### Step 2 — You drive film to the lab in Raleigh
On the dashboard, find the order card and click **Update Status → Received at Lab**.

The system will:
- Update the order status
- Send the customer an email saying their film has arrived at the lab

---

### Step 3 — Lab sends scans back
When you receive the WeTransfer link from the lab, go to the order card and click **Update Status → Scans Sent**.

A box will appear asking you to paste the WeTransfer download link. Once you confirm:
- The link is saved to the order permanently
- The customer receives an email with their download link
- The order card shows a **Copy link** and **Open** button for your reference

> The WeTransfer link is stored in the database. You can always go back to the order card to copy or open it again later.

---

## Emails — What Gets Sent and When

There are exactly 3 emails, one per status change:

| When | Email sent | What it says |
|------|-----------|--------------|
| New drop-off logged | Confirmation | "We've got your film, here's your order info" |
| Status → Received at Lab | Lab update | "Your film is at the lab in Raleigh" |
| Status → Scans Sent | Scans ready | "Your scans are ready — download link inside" |

**No email is sent if the customer has no email address on file.**

**If an email fails to send**, a red "⚠️ Email failed to send" banner appears on the order card with a **Retry** button. Click it to try again.

---

## What You Can Change

### Email templates
All 3 email templates are managed in your **Resend dashboard** (resend.com). Log in there and go to Templates. You can edit:
- The subject line
- The body text and layout
- The variables used: `{{first_name}}`, `{{order_number}}`, `{{roll_count}}`, `{{wetransfer_link}}`

> Do not rename the variables (e.g. do not change `{{first_name}}` to `{{name}}`) — the system fills these in automatically and the names must match exactly.

### Customer records
On the Customers page, click any row to edit:
- Email, First Name, Last Name
- Last drop-off date, Order number, Current rolls, Total rolls, Drop-off count
- Notes (internal, never shown to customers)

### Order status
On the Dashboard, use the **Update Status** dropdown on any order card. You can also move a status backward (e.g. from Received at Lab back to Received by Yours) — it will ask you to confirm first.

---

## What You Cannot Change (Without a Developer)

- The 3 status names ("Received by Yours", "Received at Lab", "Scans Sent") — these are hardcoded in the system
- The order of the statuses — they always go in the same sequence
- Adding new status types
- The WeTransfer link validation — it only accepts links from `wetransfer.com`
- The login email — only `hello@yoursdurham.com` has access

---

## Customer Deduplication — How It Works

When you log a new drop-off, the system tries to find an existing customer before creating a new one:

1. It searches by **email address** first (exact match, case-insensitive)
2. If no email match, it searches by **name** (case-insensitive, ignores extra spaces)
3. If still no match → a new customer is created automatically

This means:
- If you enter "John Smith" and there's already a "john smith" in the system, it will link to the existing customer — **not create a duplicate**
- If the same person drops off film 5 times, their total drop-off count and total rolls will accumulate correctly

> **Important:** Enter the customer's email whenever possible. Name matching is less reliable — "Jon Smith" and "John Smith" would be treated as two different people.

---

## The Customer Table — What Each Column Means

| Column | What it is |
|--------|-----------|
| Email | Customer's email address — used for sending emails and finding existing customers |
| First Name | First name only |
| Last Name | Last name only (do not put full name in First Name) |
| Date | Date of their most recent drop-off |
| Order # | Most recent order number |
| Current Rolls | Number of rolls in the most recent drop-off |
| Total Rolls | All rolls across every drop-off ever |
| Drop-off Count | Total number of times this customer has dropped off film |

---

## The WeTransfer Link

When you update an order to **Scans Sent**, the system asks for the WeTransfer download link from the lab. This link is:

- **Saved permanently** to the order in the database
- **Sent automatically** in the scans email to the customer
- **Available anytime** on the order card (Copy link / Open buttons)
- **Accessible** from the customer's expanded row in the Customers page

> WeTransfer links expire after 7 days. If a customer misses the link, you can go to the order card and copy it to send manually — but if the WeTransfer itself has expired, you'll need to contact the lab.

---

## Frequently Asked Questions

**What if I log a drop-off with the wrong order number?**
Delete the order from the dashboard (trash icon on the card) and re-create it with the correct number. Order numbers must be unique — the system will reject a duplicate.

**What if a customer has no email?**
The drop-off is still logged and saved. No email will be sent. You can add their email later on the Customers page, but it won't retroactively send any missed emails.

**Can two customers have the same name?**
Yes — if they have different email addresses the system will keep them as separate records. If they have no email and the same name, the system will treat them as the same person. Use notes to distinguish them.

**What if the email fails and Retry doesn't work?**
The most common reason is the sending domain isn't verified in Resend. Contact your developer to check the Resend dashboard.

**Can I change what the tracking page looks like?**
Not without a developer. The tracking page is part of the app code.

---

## Summary

```
Customer drops off film
        ↓
You log it → "Received by Yours" → Email 1 sent to customer
        ↓
You drive film to Raleigh → "Received at Lab" → Email 2 sent to customer
        ↓
Lab sends scans → You paste WeTransfer link → "Scans Sent" → Email 3 sent with download link
```

That's the entire workflow. Everything else (customer records, email retries, search, editing) is for managing and correcting data as needed.
