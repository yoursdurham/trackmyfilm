import { createClient } from "@supabase/supabase-js";

export const ACCOUNT_SIGN_IN_SUBJECT = "Your Track My Film sign-in link";

const HEADING = "Sign in to Track My Film";
const INTRO =
  "Tap the button below to see your orders, scans and film stats. This link works once and expires in 1 hour.";
const BUTTON_LABEL = "Sign in →";
const IGNORE = "Didn't ask for this? You can ignore this email.";
const FONT = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const BUSINESS_LINES = [
  "Yours, Durham",
  "209 N. Gregson St. Durham, NC 27701",
  "Retail Hours: Thursdays 5-7PM & Saturdays 11-2PM",
  "hello@yoursdurham.com",
  "Film Drop Box - 24/7",
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One-time link the confirm route already accepts. generateLink does not email it. */
export function accountSignInConfirmUrl(origin: string, tokenHash: string): string {
  const url = new URL("/auth/confirm", origin);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", "magiclink");
  url.searchParams.set("next", "/account");
  return url.toString();
}

export function accountSignInEmailHtml(confirmUrl: string, logoUrl: string): string {
  const safeUrl = escapeHtml(confirmUrl);
  const safeLogo = escapeHtml(logoUrl);
  const hours = "Retail Hours: Thursdays 5-7PM &amp; Saturdays 11-2PM";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${HEADING}</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&amp;display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#FFF6D3;">
  <div style="display:none;font-size:1px;color:#FFF6D3;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${INTRO}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFF6D3;">
    <tr>
      <td align="center" style="padding:32px 16px;font-family:${FONT};color:#1a1a1a;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border-radius:28px;overflow:hidden;">
          <tr>
            <td style="background:#DDB1B1;padding:14px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="12" height="12" style="width:12px;height:12px;background:#C9B7C6;border:1px solid #1a1a1a;border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>
                  <td width="8" style="font-size:0;line-height:0;">&nbsp;</td>
                  <td width="12" height="12" style="width:12px;height:12px;background:#E4D48A;border:1px solid #1a1a1a;border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>
                  <td width="8" style="font-size:0;line-height:0;">&nbsp;</td>
                  <td width="12" height="12" style="width:12px;height:12px;background:#A9C99A;border:1px solid #1a1a1a;border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 32px;background:#ffffff;font-family:${FONT};color:#1a1a1a;">
              <img src="${safeLogo}" width="56" height="56" alt="Yours, Durham" style="display:block;width:56px;height:56px;border:0;border-radius:12px;outline:none;text-decoration:none;">
              <h1 style="margin:20px 0 12px;font-family:${FONT};font-size:22px;line-height:1.35;font-weight:700;color:#1a1a1a;">${HEADING}</h1>
              <p style="margin:0 0 20px;font-family:${FONT};font-size:15px;line-height:1.55;color:#1a1a1a;">${INTRO}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#A1CC93" style="background:#A1CC93;border-radius:12px;">
                    <a href="${safeUrl}" style="display:block;padding:14px 16px;font-family:${FONT};font-size:16px;line-height:1.3;font-weight:700;color:#1a1a1a;text-align:center;text-decoration:none;">${BUTTON_LABEL}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 8px;font-family:${FONT};font-size:13px;line-height:1.5;color:#1a1a1a;">Or paste this link into your browser:</p>
              <p style="margin:0 0 18px;font-family:${FONT};font-size:13px;line-height:1.5;word-break:break-all;">
                <a href="${safeUrl}" style="color:#1a1a1a;text-decoration:underline;">${safeUrl}</a>
              </p>
              <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:#1a1a1a;">${IGNORE}</p>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;margin-top:20px;">
          <tr>
            <td style="background:#FFF6D3;padding:4px 8px 8px;font-family:${FONT};font-size:13px;line-height:1.7;color:#1a1a1a;text-align:center;">
              <a href="https://www.yoursdurham.com" style="color:#1a1a1a;font-weight:700;text-decoration:underline;">Yours, Durham</a><br>
              209 N. Gregson St. Durham, NC 27701<br>
              ${hours}<br>
              <a href="mailto:hello@yoursdurham.com" style="color:#1a1a1a;text-decoration:underline;">hello@yoursdurham.com</a><br>
              Film Drop Box - 24/7
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function accountSignInEmailText(confirmUrl: string): string {
  return [
    HEADING,
    "",
    INTRO,
    "",
    `Sign in: ${confirmUrl}`,
    "",
    IGNORE,
    "",
    ...BUSINESS_LINES,
  ].join("\n");
}

/**
 * Mints a magic link without asking Supabase to send mail, then delivers it
 * with Resend. signInWithOtp would hand the message to Auth's mailer.
 */
export async function sendAccountSignInEmail(email: string, origin: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !supabaseUrl || !serviceKey) {
    console.error("[account/sign-in] Resend or Supabase service role is not configured, so no sign-in link was sent.");
    return;
  }

  try {
    const redirectTo = `${origin}/auth/confirm?next=/account`;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) {
      console.error("[account/sign-in]", error?.message ?? "magic link was not created");
      return;
    }

    const confirmUrl = accountSignInConfirmUrl(origin, tokenHash);
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
        to: [email],
        reply_to: process.env.REPLY_TO_EMAIL || "hello@yoursdurham.com",
        subject: ACCOUNT_SIGN_IN_SUBJECT,
        html: accountSignInEmailHtml(confirmUrl, `${origin}/logo.png`),
        text: accountSignInEmailText(confirmUrl),
      }),
    });
    if (!resendRes.ok) {
      const detail = await resendRes.text();
      console.error("[account/sign-in] Resend rejected the sign-in email:", resendRes.status, detail.slice(0, 300));
    }
  } catch (error) {
    console.error("[account/sign-in]", error instanceof Error ? error.message : "sign-in email failed");
  }
}
