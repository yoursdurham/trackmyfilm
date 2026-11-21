import { createHmac, timingSafeEqual } from "node:crypto";
import { isValidEmail, normalizeEmail } from "@/lib/validation";
import { SHOP_NAME } from "@/lib/marketing/types";

export type { Personalization } from "@/lib/marketing/render";
export {
  applyPersonalization,
  escapeHtml,
  findUnknownTokens,
  parseBlocks,
  personalizationFor,
  plainTextFromBlocks,
  renderMarketingHtml,
  renderMarketingText,
  samplePerson,
} from "@/lib/marketing/render";

export type UnsubscribePayload = {
  email: string;
  campaignId?: string;
  deliveryId?: string;
};

export function signUnsubscribeToken(payload: UnsubscribePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify({
    e: normalizeEmail(payload.email),
    c: payload.campaignId ?? "",
    d: payload.deliveryId ?? "",
  }), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyUnsubscribeToken(token: string, secret: string): UnsubscribePayload | null {
  if (!secret || !token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { e?: unknown; c?: unknown; d?: unknown };
    if (typeof parsed.e !== "string" || !isValidEmail(parsed.e)) return null;
    return {
      email: normalizeEmail(parsed.e),
      campaignId: typeof parsed.c === "string" && parsed.c ? parsed.c : undefined,
      deliveryId: typeof parsed.d === "string" && parsed.d ? parsed.d : undefined,
    };
  } catch {
    return null;
  }
}

export function unsubscribeUrl(origin: string, token: string): string {
  const url = new URL("/email/unsubscribe", origin);
  url.searchParams.set("token", token);
  return url.toString();
}

export function listUnsubscribeHeaders(url: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

const BLOCKED_TEST_RECIPIENTS = new Set(["all", "subscribers", "everyone", "customers", "*"]);

/** A test send accepts one address typed by staff. It never accepts a list or a segment name. */
export function assertExplicitTestRecipient(to: unknown): string | { error: string } {
  if (Array.isArray(to)) return { error: "A test send goes to one address you type in." };
  if (typeof to !== "string") return { error: "Type the address that should receive the test." };
  const normalized = normalizeEmail(to);
  if (!normalized || BLOCKED_TEST_RECIPIENTS.has(normalized)) {
    return { error: "Type one email address. A test cannot go to a segment or the whole list." };
  }
  if (!isValidEmail(normalized)) return { error: "That email address does not look complete." };
  return normalized;
}

export function marketingFromAddress(envFrom: string | undefined, displayName = SHOP_NAME): string | { error: string } {
  const raw = envFrom?.trim() ?? "";
  const match = raw.match(/<([^>]+)>/);
  const address = normalizeEmail(match?.[1] ?? raw);
  if (!address || !isValidEmail(address)) {
    return { error: "RESEND_FROM_EMAIL is not a usable from address." };
  }
  const name = displayName.trim() || SHOP_NAME;
  return `${name} <${address}>`;
}

