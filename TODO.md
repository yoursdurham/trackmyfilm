# TrackMyFilm — To-Do

> Last updated: April 2026

---

## What Still Needs to Be Done

---

### Daniel (Developer) — Action Items

#### 1. Update `NEXT_PUBLIC_APP_URL` when deployed
Once the app is live on Vercel, update `.env` (and Vercel environment variables) with the real URL:
```
NEXT_PUBLIC_APP_URL=https://your-production-url.com
```
The "Track Your Order" button in emails currently links to `http://localhost:3000`.

#### 2. Set up custom domain on Vercel
Right now the app runs on a Vercel-generated URL (e.g. `trackmyfilm-xyz.vercel.app`). To use a real domain like `trackmyfilm.yoursdurham.com`:
1. Go to **Vercel → Project → Settings → Domains**
2. Add your domain (e.g. `trackmyfilm.yoursdurham.com`)
3. Vercel will give you a DNS record — add it at your domain registrar (wherever `yoursdurham.com` is managed — Squarespace, GoDaddy, Namecheap, etc.)
4. Once verified, update `NEXT_PUBLIC_APP_URL` in Vercel environment variables:
   ```
   NEXT_PUBLIC_APP_URL=https://trackmyfilm.yoursdurham.com
   ```

#### 3. Verify sending domain in Resend
Right now emails send from `onboarding@resend.dev` (test mode). To send from a real Yours Durham address:
1. Go to resend.com → Domains → Add Domain
2. Add `trackmyfilm.com` or `yoursdurham.com`
3. Add the DNS records Resend gives you to the domain registrar
4. Once verified, update `RESEND_FROM_EMAIL` in Vercel environment variables:
   ```
   RESEND_FROM_EMAIL=Yours Durham <no-reply@trackmyfilm.com>
   ```

#### 4. Add all env variables to Vercel
In **Vercel → Project → Settings → Environment Variables**, add every variable from the local `.env` file:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_TEMPLATE_FILM_DROP_RECEIVED`
- `RESEND_TEMPLATE_FILM_AT_LAB`
- `RESEND_TEMPLATE_SCANS_SENT`
- `NEXT_PUBLIC_APP_URL`
- `REPLY_TO_EMAIL`
- `NEXT_PUBLIC_CONTACT_EMAIL`

---

### Justin (Client) — Action Items

#### 1. Finish the `scans_sent` email template in Resend
This template is incomplete. It currently shows the `film_drop_received` content. It needs to be updated to include the customer's download link.

Go to: **resend.com → Templates → scans_sent**

Update the body to include the WeTransfer variable. Example content:

```
Hey {{first_name}}!

Great news — your scans are ready for order #{{order_number}} ({{roll_count}} rolls).

Download your scans here:
{{wetransfer_link}}

Your negatives will be held at our store for 60 days after processing.
If you have any questions, just reply to this email.
```

The exact wording and design is up to you — just make sure `{{wetransfer_link}}` is included somewhere, otherwise customers won't get their download link.

**Important:** Click **Publish** when done. Draft templates will not send.

---

#### 2. Review and update all 3 email templates

All 3 templates are in **resend.com → Templates**. Review each one and adjust the content to your liking.

**What you can freely change:**
- Subject line
- Body text and wording
- Layout and design (colors, fonts, logo)
- Any static content (turnaround times, store info, etc.)

**What you must NOT rename (these are filled in automatically):**

| Variable | What it inserts |
|----------|----------------|
| `{{first_name}}` | Customer's first name |
| `{{order_number}}` | The order number (e.g. JE1234) |
| `{{roll_count}}` | Number of rolls in the order |
| `{{wetransfer_link}}` | The WeTransfer download link (scans_sent only) |

If you rename a variable (e.g. change `{{first_name}}` to `{{name}}`), the email will send with the raw `{{name}}` text showing instead of the actual name. Tell your developer if you want to add new variables.

---

#### 3. Subjects — current defaults

Check and update the subject lines in Resend to whatever you prefer:

| Template | Suggested subject |
|----------|------------------|
| `film_drop_received` | We've got your film! |
| `film_at_lab` | Your film is at the lab |
| `scans_sent` | Your scans are ready — download here |

---

#### 4. Test all 3 emails end to end

Before going live, do a full test run with your own email:

1. Log a new drop-off with your email → you should receive the **film_drop_received** email
2. Update the status to "Received at Lab" → you should receive the **film_at_lab** email
3. Update the status to "Scans Sent" and paste any WeTransfer link → you should receive the **scans_sent** email with the link

If any email fails, a red "⚠️ Email failed to send" banner will appear on the order card with a **Retry** button.

---

## What Is Already Done

- All 529 customers imported from the CSV spreadsheet
- Film orders table with full status tracking
- Dashboard with order cards, status updates, search and filter
- Customers page with inline editing, search, pagination
- Public tracking page for customers to check their order
- Atomic drop-off creation (customer lookup + order + email in one step)
- Email retry button on failed orders
- Send email toggle per drop-off (on by default, can be turned off)
- WeTransfer link saved to database and shown on order card
- Vercel Analytics installed
- LOGIC.md written for Justin explaining how everything works

---

## Notes

- The app login is: `hello@yoursdurham.com` / `YoursDurham2026!`
- Only one admin account exists — all staff share this login
- Emails will only deliver to verified addresses while using `onboarding@resend.dev` (test mode). Once the domain is verified, they deliver to anyone.
