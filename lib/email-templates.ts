/**
 * lib/email-templates.ts
 * All transactional email HTML — no external template IDs needed.
 * Matches the Yours Durham branding from the original Make.com blueprint.
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://trackmyfilm.yoursdurham.com";
const REPLY_TO  = process.env.REPLY_TO_EMAIL || "hello@yoursdurham.com";

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#faf4d6;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf4d6;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#1a1a1a;padding:28px 40px;text-align:center;">
            <p style="margin:0;color:#f59e0b;font-size:13px;letter-spacing:3px;text-transform:uppercase;font-weight:600;">Yours Durham</p>
            <p style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Film Lab</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9f6ee;padding:24px 40px;border-top:1px solid #ede8d8;text-align:center;">
            <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
              Questions? Reply to this email or reach us at
              <a href="mailto:${REPLY_TO}" style="color:#f59e0b;text-decoration:none;">${REPLY_TO}</a>
            </p>
            <p style="margin:8px 0 0;color:#d1c9b0;font-size:11px;">
              Yours Durham · Film Lab &amp; Creative Space
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:24px;padding:13px 28px;background:#f59e0b;color:#1a1a1a;font-weight:700;font-size:14px;text-decoration:none;border-radius:8px;letter-spacing:0.3px;">${text}</a>`;
}

function orderDetails(rollCount: number, filmType: string, filmProcess: string, orderNumber: string): string {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#faf9f5;border:1px solid #ede8d8;border-radius:8px;">
    <tr><td style="padding:20px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;color:#6b7280;font-size:13px;width:40%;">Order #</td>
          <td style="padding:4px 0;color:#1a1a1a;font-size:13px;font-weight:600;">${orderNumber}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#6b7280;font-size:13px;">Rolls</td>
          <td style="padding:4px 0;color:#1a1a1a;font-size:13px;font-weight:600;">${rollCount}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#6b7280;font-size:13px;">Film Type</td>
          <td style="padding:4px 0;color:#1a1a1a;font-size:13px;font-weight:600;">${filmType}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#6b7280;font-size:13px;">Process</td>
          <td style="padding:4px 0;color:#1a1a1a;font-size:13px;font-weight:600;">${filmProcess}</td>
        </tr>
      </table>
    </td></tr>
  </table>`;
}

// ─── Email 1: Regular drop-off confirmation ───────────────────────────────
export function filmDropReceived(params: {
  firstName: string;
  rollCount: number;
  filmType: string;
  filmProcess: string;
  orderNumber: string;
}): { subject: string; html: string } {
  const { firstName, rollCount, filmType, filmProcess, orderNumber } = params;
  return {
    subject: "We've got your film! 🎞️",
    html: layout("Yours Film Drop Confirmation", `
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#1a1a1a;">Hey ${firstName}!</h1>
      <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">
        Thanks for dropping off your film and trusting us with your memories 🙌
      </p>
      ${orderDetails(rollCount, filmType, filmProcess, orderNumber)}
      <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.7;">
        Your film is on its way to Raleigh for processing. Here's what to expect:
      </p>
      <ul style="margin:12px 0;padding-left:20px;color:#4b5563;font-size:14px;line-height:1.9;">
        <li><strong>Color film:</strong> up to 5 days for scans via WeTransfer</li>
        <li><strong>Black &amp; white:</strong> up to 8 days for scans via WeTransfer</li>
        <li><strong>Develop only:</strong> you'll be notified when negatives are back in Durham</li>
      </ul>
      <p style="margin:12px 0 0;color:#6b7280;font-size:13px;">
        Your negatives will be held for <strong>60 days</strong> after processing.
      </p>
      ${btn("Track Your Order", `${BASE_URL}/tracking`)}
      <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">
        Questions about your order? Just reply to this email.
      </p>
    `),
  };
}

// ─── Email 2: Film arrived at lab ─────────────────────────────────────────
export function filmAtLab(params: {
  firstName: string;
  rollCount: number;
  filmType: string;
  filmProcess: string;
  orderNumber: string;
}): { subject: string; html: string } {
  const { firstName, rollCount, filmType, filmProcess, orderNumber } = params;
  return {
    subject: "Your film has arrived at the lab! 🧪",
    html: layout("Film Arrived at the Lab", `
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#1a1a1a;">Great news, ${firstName}!</h1>
      <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">
        Your film has arrived at our lab in Raleigh and processing has begun.
      </p>
      ${orderDetails(rollCount, filmType, filmProcess, orderNumber)}
      <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.7;">
        Estimated turnaround from here:
      </p>
      <ul style="margin:12px 0;padding-left:20px;color:#4b5563;font-size:14px;line-height:1.9;">
        <li><strong>Color film:</strong> up to 5 days</li>
        <li><strong>Black &amp; white:</strong> up to 8 days</li>
      </ul>
      <p style="margin:12px 0 0;color:#6b7280;font-size:13px;">
        You'll receive another email with your WeTransfer download link as soon as your scans are ready.
      </p>
      ${btn("Track Your Order", `${BASE_URL}/tracking`)}
    `),
  };
}

// ─── Email 5: Scans ready ─────────────────────────────────────────────────
export function scansSent(params: {
  firstName: string;
  rollCount: number;
  filmType: string;
  filmProcess: string;
  orderNumber: string;
  wetransferLink: string;
}): { subject: string; html: string } {
  const { firstName, rollCount, filmType, filmProcess, orderNumber, wetransferLink } = params;
  return {
    subject: "Your scans are ready! 📸",
    html: layout("Your Scans Are Ready", `
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#1a1a1a;">Your scans are ready, ${firstName}!</h1>
      <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">
        Your film has been processed and your digital scans are ready to download. 🎉
      </p>
      ${orderDetails(rollCount, filmType, filmProcess, orderNumber)}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#f0fdf4;border:2px solid #22c55e;border-radius:10px;">
        <tr><td style="padding:20px 24px;text-align:center;">
          <p style="margin:0 0 4px;color:#15803d;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Your Download Link</p>
          <p style="margin:4px 0 16px;color:#166534;font-size:13px;">Link expires after 7 days — download your scans soon!</p>
          <a href="${wetransferLink}" style="display:inline-block;padding:13px 32px;background:#22c55e;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;border-radius:8px;">
            Download Scans via WeTransfer
          </a>
        </td></tr>
      </table>
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.7;">
        Your <strong>negatives</strong> will be held at our Durham location for <strong>60 days</strong>.
        If you'd like them returned, stop by or reply to this email.
      </p>
      <p style="margin:12px 0 0;color:#6b7280;font-size:13px;">
        Loved the results? Tag us <strong>@yoursdurham</strong> — we'd love to see your shots. 📷
      </p>
    `),
  };
}
