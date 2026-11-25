import type { MetricValue } from "@/lib/marketing/types";

export type EngagementInput = {
  webhookConfigured: boolean;
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  opened: number;
  clicked: number;
};

export type EngagementReport = {
  sent: MetricValue;
  delivered: MetricValue;
  bounced: MetricValue;
  complained: MetricValue;
  unsubscribed: MetricValue;
  opened: MetricValue;
  clicked: MetricValue;
};

const WEBHOOK_REASON = "Unavailable until the Resend webhook is connected. A missing webhook is not zero.";

function fromWebhook(configured: boolean, value: number, note?: string): MetricValue {
  if (!configured) return { state: "unavailable", reason: WEBHOOK_REASON };
  return note ? { state: "value", value, note } : { state: "value", value };
}

/** Sent and unsubscribed come from TrackMyFilm. Opens are approximate when the webhook is connected. */
export function engagementReport(input: EngagementInput): EngagementReport {
  return {
    sent: { state: "value", value: input.sent },
    delivered: fromWebhook(input.webhookConfigured, input.delivered),
    bounced: fromWebhook(input.webhookConfigured, input.bounced),
    complained: fromWebhook(input.webhookConfigured, input.complained),
    unsubscribed: { state: "value", value: input.unsubscribed, note: "Counted when someone uses the unsubscribe link." },
    opened: fromWebhook(input.webhookConfigured, input.opened, "Approximate. Mail apps can record an open without a person reading the message."),
    clicked: fromWebhook(input.webhookConfigured, input.clicked),
  };
}

export type ClickFact = { email: string; at: string };
export type OrderFact = { email: string; at: string };

/**
 * A conversion is a film order created after a click, within the window.
 * Without webhook click data the result is unavailable, not zero.
 */
export function attributeDropoffs(input: {
  webhookConfigured: boolean;
  clicks: ClickFact[] | null;
  orders: OrderFact[];
  windowDays: number;
}): MetricValue {
  if (!input.webhookConfigured || input.clicks === null) {
    return {
      state: "unavailable",
      reason: "Unavailable until click events arrive from the Resend webhook. There is no other link between a marketing email and a drop-off.",
    };
  }
  const clicksByEmail = new Map<string, number[]>();
  for (const click of input.clicks) {
    const at = Date.parse(click.at);
    if (Number.isNaN(at)) continue;
    const list = clicksByEmail.get(click.email) ?? [];
    list.push(at);
    clicksByEmail.set(click.email, list);
  }
  let conversions = 0;
  const windowMs = input.windowDays * 86_400_000;
  for (const order of input.orders) {
    const at = Date.parse(order.at);
    const clicks = clicksByEmail.get(order.email);
    if (Number.isNaN(at) || !clicks) continue;
    if (clicks.some((clickAt) => at > clickAt && at - clickAt <= windowMs)) conversions += 1;
  }
  return {
    state: "value",
    value: conversions,
    note: `Film orders created within ${input.windowDays} days after a click on this email.`,
  };
}

export function aiDraftingStatus(): {
  available: true;
  title: string;
  detail: string;
} {
  return {
    available: true,
    title: "Draft with AI",
    detail: "The editor can draft a subject, preview, and blocks from a short note. That note and a fixed shop description are the only things sent. Customer lists, segments, and email addresses are not. On Vercel this uses the AI Gateway with the deployment OIDC token. Set AI_GATEWAY_API_KEY to draft outside Vercel.",
  };
}
