import { SHOP_NAME, type EmailBlock, type EmailDraft, type MarketingPerson } from "@/lib/marketing/types";

const FONT = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace";
const KNOWN_TOKENS = new Set(["first_name", "shop_name", "dropoff_count"]);

export type Personalization = {
  firstName: string;
  dropoffCount: number | null;
};

export function personalizationFor(person: Pick<MarketingPerson, "firstName" | "totalDropoffs">): Personalization {
  return {
    firstName: person.firstName.trim(),
    dropoffCount: Number.isFinite(person.totalDropoffs) ? person.totalDropoffs : null,
  };
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function findUnknownTokens(value: string): string[] {
  const found = new Set<string>();
  for (const match of value.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)) {
    const name = match[1]?.toLowerCase();
    if (name && !KNOWN_TOKENS.has(name)) found.add(name);
  }
  return [...found];
}

export function applyPersonalization(value: string, person: Personalization): string {
  return value.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (full, raw: string) => {
    const name = raw.toLowerCase();
    if (name === "first_name") return person.firstName || "there";
    if (name === "shop_name") return SHOP_NAME;
    if (name === "dropoff_count") return person.dropoffCount === null ? "several" : String(person.dropoffCount);
    return full;
  });
}

export function plainTextFromBlocks(draft: Pick<EmailDraft, "subject" | "blocks">): string {
  const lines = [draft.subject, ""];
  for (const block of draft.blocks) {
    if (block.type === "heading" || block.type === "text") lines.push(block.text, "");
    if (block.type === "button") lines.push(`${block.label}: ${block.href}`, "");
  }
  return lines.join("\n").trim();
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function renderMarketingHtml(input: {
  draft: EmailDraft;
  person: Personalization;
  previewText: string;
  unsubscribeUrl: string;
  physicalAddress: string;
  hoursLabel: string;
}): string {
  const preview = escapeHtml(applyPersonalization(input.previewText, input.person));
  const blocks = input.draft.blocks.map((block) => {
    if (block.type === "heading") {
      const text = escapeHtml(applyPersonalization(block.text, input.person));
      return `<h1 style="margin:0 0 12px;font-family:${FONT};font-size:22px;line-height:1.35;font-weight:700;color:#1a1a1a;">${text}</h1>`;
    }
    if (block.type === "text") {
      const text = escapeHtml(applyPersonalization(block.text, input.person)).replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.55;color:#1a1a1a;">${text}</p>`;
    }
    const href = safeHttpUrl(applyPersonalization(block.href, input.person));
    const label = escapeHtml(applyPersonalization(block.label, input.person));
    if (!href || !label) return "";
    const safeHref = escapeHtml(href);
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr><td align="center" bgcolor="#A1CC93" style="background:#A1CC93;border-radius:12px;"><a href="${safeHref}" style="display:block;padding:14px 16px;font-family:${FONT};font-size:16px;line-height:1.3;font-weight:700;color:#1a1a1a;text-align:center;text-decoration:none;">${label}</a></td></tr></table>`;
  }).join("");
  const address = escapeHtml(input.physicalAddress);
  const hours = escapeHtml(input.hoursLabel);
  const unsubscribe = escapeHtml(input.unsubscribeUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(applyPersonalization(input.draft.subject, input.person))}</title>
</head>
<body style="margin:0;padding:0;background:#FFF6D3;">
  <div style="display:none;max-height:0;overflow:hidden;color:#FFF6D3;">${preview}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFF6D3;">
    <tr>
      <td align="center" style="padding:32px 16px;font-family:${FONT};color:#1a1a1a;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border-radius:28px;">
          <tr>
            <td style="background:#DDB1B1;padding:14px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td width="12" height="12" style="width:12px;height:12px;background:#C9B7C6;border:1px solid #1a1a1a;border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>
                <td width="8" style="font-size:0;line-height:0;">&nbsp;</td>
                <td width="12" height="12" style="width:12px;height:12px;background:#E4D48A;border:1px solid #1a1a1a;border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>
                <td width="8" style="font-size:0;line-height:0;">&nbsp;</td>
                <td width="12" height="12" style="width:12px;height:12px;background:#A9C99A;border:1px solid #1a1a1a;border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 32px;background:#ffffff;">
              <img src="https://trackmyfilm.com/logo.png" width="56" height="56" alt="Yours, Durham" style="display:block;width:56px;height:56px;border:0;border-radius:12px;">
              <div style="height:20px;line-height:20px;font-size:0;">&nbsp;</div>
              ${blocks}
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;margin-top:20px;">
          <tr>
            <td style="padding:4px 8px 8px;font-family:${FONT};font-size:13px;line-height:1.7;color:#1a1a1a;text-align:center;">
              <a href="https://www.yoursdurham.com" style="color:#1a1a1a;font-weight:700;text-decoration:underline;">Yours, Durham</a><br>
              ${address}<br>
              ${hours}<br>
              <a href="mailto:hello@yoursdurham.com" style="color:#1a1a1a;text-decoration:underline;">hello@yoursdurham.com</a><br>
              You asked ${SHOP_NAME} to send this. <a href="${unsubscribe}" style="color:#1a1a1a;text-decoration:underline;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderMarketingText(input: {
  draft: EmailDraft;
  person: Personalization;
  unsubscribeUrl: string;
  physicalAddress: string;
  hoursLabel: string;
}): string {
  const body = applyPersonalization(input.draft.plainText.trim() || plainTextFromBlocks(input.draft), input.person);
  return [
    body,
    "",
    "Yours, Durham",
    input.physicalAddress,
    input.hoursLabel,
    "hello@yoursdurham.com",
    `Unsubscribe: ${input.unsubscribeUrl}`,
  ].join("\n");
}


export function parseBlocks(value: unknown): EmailBlock[] | { error: string } {
  if (!Array.isArray(value)) return { error: "The email needs a list of blocks." };
  if (value.length > 20) return { error: "Use 20 blocks or fewer." };
  const blocks: EmailBlock[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return { error: "A block was not readable." };
    const block = item as { id?: unknown; type?: unknown; text?: unknown; label?: unknown; href?: unknown };
    const id = typeof block.id === "string" && block.id ? block.id.slice(0, 40) : crypto.randomUUID();
    if (block.type === "heading" || block.type === "text") {
      if (typeof block.text !== "string") return { error: "A text block needs text." };
      blocks.push({ id, type: block.type, text: block.text.slice(0, 4000) });
      continue;
    }
    if (block.type === "button") {
      if (typeof block.label !== "string" || typeof block.href !== "string") {
        return { error: "A button needs a label and a link." };
      }
      blocks.push({ id, type: "button", label: block.label.slice(0, 80), href: block.href.slice(0, 2000) });
      continue;
    }
    return { error: "A block type is not supported." };
  }
  return blocks;
}

export function samplePerson(): Personalization {
  return { firstName: "", dropoffCount: null };
}
