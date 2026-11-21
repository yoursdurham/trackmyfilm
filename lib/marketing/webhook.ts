import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookCheck = { ok: true } | { ok: false; reason: string };

export function verifyResendWebhook(input: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowMs?: number;
  toleranceSec?: number;
}): WebhookCheck {
  if (!input.secret) return { ok: false, reason: "Webhook secret is not set." };
  if (!input.id || !input.timestamp || !input.signature) return { ok: false, reason: "Missing signature headers." };
  const timestamp = Number(input.timestamp);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: "Bad timestamp." };
  const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSec - timestamp) > (input.toleranceSec ?? 300)) {
    return { ok: false, reason: "Timestamp is outside the allowed window." };
  }
  const secretBody = input.secret.startsWith("whsec_") ? input.secret.slice("whsec_".length) : input.secret;
  const key = Buffer.from(secretBody, "base64");
  const expected = createHmac("sha256", key).update(`${input.id}.${input.timestamp}.${input.body}`).digest("base64");
  const expectedBuf = Buffer.from(expected);
  for (const part of input.signature.split(" ")) {
    const [version, ...rest] = part.split(",");
    if (version !== "v1") continue;
    const given = Buffer.from(rest.join(","));
    if (given.length === expectedBuf.length && timingSafeEqual(given, expectedBuf)) return { ok: true };
  }
  return { ok: false, reason: "Signature does not match." };
}

export type DeliveryNotice = {
  kind: "delivery";
  eventType: "email.delivered" | "email.bounced" | "email.complained" | "email.opened" | "email.clicked";
  resendId: string;
  deliveryId: string | null;
  email: string | null;
  url?: string;
};

export type InterpretedWebhook =
  | DeliveryNotice
  | { kind: "ignore"; eventType: string };

function tagValue(tags: unknown, name: string): string | null {
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (tag && typeof tag === "object" && (tag as { name?: string }).name === name) {
        const value = (tag as { value?: unknown }).value;
        if (typeof value === "string" && value) return value;
      }
    }
    return null;
  }
  if (tags && typeof tags === "object") {
    const value = (tags as Record<string, unknown>)[name];
    return typeof value === "string" && value ? value : null;
  }
  return null;
}

const EVENT_TYPES = new Set(["email.delivered", "email.bounced", "email.complained", "email.opened", "email.clicked"]);

export function interpretResendWebhook(payload: unknown): InterpretedWebhook | { error: string } {
  if (!payload || typeof payload !== "object") return { error: "Webhook body was not an object." };
  const record = payload as { type?: unknown; data?: unknown };
  const eventType = typeof record.type === "string" ? record.type : "";
  if (!EVENT_TYPES.has(eventType)) return { kind: "ignore", eventType: eventType || "unknown" };
  const data = record.data;
  if (!data || typeof data !== "object") return { error: "Webhook event is missing data." };
  const fields = data as { email_id?: unknown; to?: unknown; tags?: unknown; click?: { link?: unknown } };
  const resendId = typeof fields.email_id === "string" ? fields.email_id : "";
  if (!resendId) return { error: "Webhook event is missing email_id." };
  const to = Array.isArray(fields.to) ? fields.to.find((value) => typeof value === "string") : null;
  const notice: DeliveryNotice = {
    kind: "delivery",
    eventType: eventType as DeliveryNotice["eventType"],
    resendId,
    deliveryId: tagValue(fields.tags, "delivery_id"),
    email: typeof to === "string" ? to : null,
    url: eventType === "email.clicked" && typeof fields.click?.link === "string" ? fields.click.link : undefined,
  };
  return notice;
}

export function suppressionForNotice(notice: DeliveryNotice): "bounced" | "complained" | null {
  if (notice.eventType === "email.bounced") return "bounced";
  if (notice.eventType === "email.complained") return "complained";
  return null;
}

export type DeliveryPatch = {
  deliveredAt?: string;
  bouncedAt?: string;
  complainedAt?: string;
  openedAt?: string;
  clickedAt?: string;
};

export function patchForNotice(notice: DeliveryNotice, nowIso: string): DeliveryPatch {
  if (notice.eventType === "email.delivered") return { deliveredAt: nowIso };
  if (notice.eventType === "email.bounced") return { bouncedAt: nowIso };
  if (notice.eventType === "email.complained") return { complainedAt: nowIso };
  if (notice.eventType === "email.opened") return { openedAt: nowIso };
  return { clickedAt: nowIso };
}
