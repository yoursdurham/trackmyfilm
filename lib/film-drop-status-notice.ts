/**
 * Temporary notice on the drop-off email (`film_drop_received`), sent when an
 * order is marked Received by Yours.
 *
 * Change this object to run another notice. The Resend template does not
 * contain the copy. It only has two empty slots under the "We've got your
 * film." line:
 *
 * - HTML: `{{{status_notice_html}}}` as its own table row
 * - Plain text: `{{{status_notice_text}}}` on the blank line before "Received:"
 *
 * Sends at or after `expiresAt` leave both slots blank, so the notice
 * disappears without another template edit. Each value must stay under
 * Resend's 2,000-character string limit.
 *
 * `expiresAt` is the first instant the notice is hidden: end of day Tuesday,
 * Nov 17, 2026, America/New_York (2026-11-18T00:00:00-05:00).
 */
export const FILM_DROP_STATUS_NOTICE = {
  heading: "Status update",
  message:
    "Heads up: we're skipping this Friday's lab run. Your film will head to the lab on Tuesday, Nov 17.",
  expiresAt: "2026-11-18T00:00:00-05:00",
} as const;

export const FILM_DROP_STATUS_NOTICE_VARIABLES = {
  html: "status_notice_html",
  text: "status_notice_text",
} as const;

const FONT =
  "'JetBrains Mono',ui-monospace,'SFMono-Regular',Menlo,Consolas,'Courier New',monospace";

export type FilmDropStatusNoticeContent = {
  html: string;
  text: string;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function noticeHtml(heading: string, message: string): string {
  const safeHeading = escapeHtml(heading);
  const safeMessage = escapeHtml(message);
  return (
    `<tr>` +
    `<td class="px" lang="en" dir="ltr" align="left" style="padding-top:4px;padding-right:28px;padding-bottom:8px;padding-left:28px;font-family:${FONT};font-size:14px;line-height:1.55;color:#1a1a1a;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `<tr>` +
    `<td lang="en" dir="ltr" align="left" bgcolor="#FFF6D3" style="background-color:#FFF6D3;border-width:1.5px;border-style:solid;border-color:#DDB1B1;border-radius:6px;padding-top:14px;padding-right:16px;padding-bottom:14px;padding-left:16px;font-family:${FONT};font-size:14px;line-height:1.55;color:#1a1a1a;">` +
    `<h2 style="margin-top:0;margin-right:0;margin-bottom:6px;margin-left:0;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0;font-family:${FONT};font-size:15px;line-height:1.4;font-weight:700;color:#1a1a1a;">${safeHeading}</h2>` +
    `<p style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0;font-family:${FONT};font-size:14px;line-height:1.55;font-weight:400;color:#1a1a1a;">${safeMessage}</p>` +
    `</td></tr></table></td></tr>`
  );
}

/** Blank once `now` reaches `expiresAt`. Defaults to the send time. */
export function filmDropStatusNotice(now: Date = new Date()): FilmDropStatusNoticeContent {
  const expiresAt = Date.parse(FILM_DROP_STATUS_NOTICE.expiresAt);
  if (Number.isNaN(expiresAt) || now.getTime() >= expiresAt) {
    return { html: "", text: "" };
  }

  const { heading, message } = FILM_DROP_STATUS_NOTICE;
  return {
    html: noticeHtml(heading, message),
    text: `${heading}\n${message}\n\n`,
  };
}
