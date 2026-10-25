# Resend order emails

Paste the HTML into a new template in the Resend dashboard, then publish it. The app sends the template id from the environment variable. It does not upload this file.

| File | Template name | Env | Suggested subject |
| --- | --- | --- | --- |
| `scans-only-ready.html` | `scans_only_ready` | `RESEND_TEMPLATE_SCANS_ONLY_READY` | Your scans are ready |

`scans_only_ready` is the Scans Only version of the process-only completion email. It is sent when a Scans Only order is marked Scans Sent, and when that customer asks for the download link again. It includes `{{wetransfer_link}}` and does not include an account link.

Run `supabase/migrations/026_scans_only_ready_email.sql` before relying on the send timestamp.
