/** Value sent to Resend `scan_notes` — never blocks email when empty. */
export function scanNotesForEmail(value?: string | null): string {
  if (value == null) return "";
  return value.trim();
}

/** Persist trimmed note, or null when empty. */
export function scanNotesForStorage(value?: string | null): string | null {
  const trimmed = scanNotesForEmail(value);
  return trimmed === "" ? null : trimmed;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML snippet for Resend `scan_notes_html` — empty when there is no note. */
export function scanNotesHtml(value?: string | null): string {
  const plain = scanNotesForEmail(value);
  if (!plain) return "";
  const body = escapeHtml(plain).replace(/\r\n/g, "\n").replace(/\n/g, "<br />");
  return `<p style="margin:16px 0 0;padding:0;"><strong>Note from the lab:</strong><br />${body}</p>`;
}
