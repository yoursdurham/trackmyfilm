# Supabase email templates

Paste these into the Supabase dashboard. They are not what the app sends for `/account/login`. That message is built in `lib/account-sign-in-email.ts` and delivered with Resend. These copies are for Authentication → Emails, if Auth’s own mailer sends them.

| File | Dashboard template | Subject |
| --- | --- | --- |
| `magic-link.html` | Magic link | Your Track My Film sign-in link |
| `confirm-signup.html` | Confirm signup | Confirm your Track My Film account |

Both include `{{ .ConfirmationURL }}` and `{{ .Token }}`.

Set **Authentication → Sign In / Providers → Email → Email OTP length** to **6**. The login form only accepts 6 digits, and the Resend sign-in email only prints the code when Supabase returns 6 digits. `verifyOtp` does not check the length itself. The **Email OTP expiration** setting also controls how long the magic link stays valid.
