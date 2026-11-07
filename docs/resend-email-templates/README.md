# Resend order emails

Paste the HTML into a new template in the Resend dashboard, then publish it. The app sends the template id from the environment variable. It does not upload this file.

| File | Template name | Env | Suggested subject |
| --- | --- | --- | --- |
| `scans-only-ready.html` | `scans_only_ready` | `RESEND_TEMPLATE_SCANS_ONLY_READY` | Your scans are ready |
| `film-drop-received-account-block.html` | `film_drop_received` | `RESEND_TEMPLATE_FILM_DROP_RECEIVED` | Your film has been received! |

`scans_only_ready` is the Scans Only version of the process-only completion email. It is sent when a Scans Only order is marked Scans Sent, and when that customer asks for the download link again. It includes `{{wetransfer_link}}` and does not include an account link.

Run `supabase/migrations/026_scans_only_ready_email.sql` before relying on the send timestamp.

## Add the account block to `film_drop_received`

`film-drop-received-account-block.html` is a fragment, not a whole email. The app does not publish it. Paste it into the existing template in the Resend dashboard.

1. Deploy the app change that sends `account_url` (or publish the variable first; see the fallback below). Run `supabase/migrations/031_account_sign_in_rate_limits.sql` so the sign-in cap is shared across servers.
2. Open Resend → Templates → `film_drop_received`. Editing the published template creates a draft. The live email keeps sending until you publish.
3. Add a string variable named `account_url`. Set the fallback to `https://trackmyfilm.com/account/login` so a send without the variable still opens sign-in.
4. In the HTML, after the Track / F.A.Q. / Shop button row and before the cream "Yours, Durham" box, paste the `<tr>` from `film-drop-received-account-block.html`. The button uses `{{{account_url}}}`, the same triple-brace syntax as `{{{tracking_url}}}`.
5. In the plain-text body, after the Shop line and before "Yours, Durham", paste:

```
YOUR FILM, ALL TOGETHER
Keep track of every roll
Create a free Track My Film account to see all your orders and the film stocks you've shot in one place.
Create your account: {{{account_url}}}
```

6. Publish the template. Drafts do not send. Send yourself a drop-off email and confirm the button opens `https://trackmyfilm.com/account/login?email=` with the customer address filled in, and that the page does not send a sign-in email until the button on that page is pressed.
