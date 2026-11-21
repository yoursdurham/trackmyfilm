import { createHash } from "node:crypto";
import {
  DEFAULT_TIMEZONE,
  MARKETING_CRON_UTC_HOUR,
  SEND_BATCH_LIMIT,
  type CampaignStatus,
} from "@/lib/marketing/types";

export function audienceFingerprint(emails: string[]): string {
  return createHash("sha256").update([...emails].sort().join("\n")).digest("hex");
}

export function deliveryIdempotencyKey(scope: { campaignId?: string | null; enrollmentId?: string | null }, email: string): string {
  const id = scope.campaignId ?? scope.enrollmentId ?? "unknown";
  return `mkt_${id}_${email}`.slice(0, 256);
}

export type DeliveryRow = {
  email: string;
  status: "pending" | "sending" | "sent" | "failed" | "skipped" | "cancelled";
  updatedAt?: string | null;
  attempts?: number;
};

/** Inserts only addresses that do not already have a row. The database unique key is the backstop. */
export function planRecipientInserts(existing: { email: string }[], candidates: { email: string }[]): {
  insert: string[];
  duplicates: string[];
} {
  const seen = new Set(existing.map((row) => row.email));
  const insert: string[] = [];
  const duplicates: string[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.email)) duplicates.push(candidate.email);
    else {
      seen.add(candidate.email);
      insert.push(candidate.email);
    }
  }
  return { insert, duplicates };
}

export function retryFailedEmails(rows: DeliveryRow[]): string[] {
  return rows.filter((row) => row.status === "failed").map((row) => row.email);
}

const SENDING_STALE_MS = 15 * 60 * 1000;

export function deliveryShouldSend(row: DeliveryRow, now: Date): boolean {
  if (row.status === "failed") return (row.attempts ?? 0) < 4;
  if (row.status === "pending") return true;
  if (row.status !== "sending") return false;
  const updated = row.updatedAt ? Date.parse(row.updatedAt) : Number.NaN;
  if (Number.isNaN(updated)) return true;
  return now.getTime() - updated >= SENDING_STALE_MS;
}

export function backoffDelayMs(attempt: number): number {
  const step = Math.max(0, attempt - 1);
  return Math.min(8000, 500 * 2 ** step);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  const limit = Math.max(1, size);
  for (let index = 0; index < items.length; index += limit) {
    groups.push(items.slice(index, index + limit));
  }
  return groups;
}

export function campaignIsDue(campaign: { status: CampaignStatus; scheduledAt: string | null }, now: Date): boolean {
  if (campaign.status !== "scheduled" && campaign.status !== "sending") return false;
  if (!campaign.scheduledAt) return campaign.status === "sending";
  const when = Date.parse(campaign.scheduledAt);
  if (Number.isNaN(when)) return false;
  return when <= now.getTime();
}

export function nextMarketingCron(now: Date, hourUtc = MARKETING_CRON_UTC_HOUR): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function scheduleExplanation(): string {
  return `The automatic check runs once a day at ${MARKETING_CRON_UTC_HOUR}:00 UTC. That is 10:00 AM Eastern Standard Time or 11:00 AM Eastern Daylight Time. Vercel Hobby cannot run this check more often. A send you set for later today waits for that check, unless you click Process due sends. Each run sends up to ${SEND_BATCH_LIMIT} emails, then stops so the request can finish. Click again to continue a larger list.`;
}

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const bag: Record<string, string> = {};
  for (const part of parts) bag[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(bag.year),
    Number(bag.month) - 1,
    Number(bag.day),
    Number(bag.hour) % 24,
    Number(bag.minute),
    Number(bag.second),
  );
  return asUtc - instant.getTime();
}

/** Wall-clock date and time in a timezone, as a UTC instant. */
export function zonedLocalToUtc(date: string, time: string, timeZone = DEFAULT_TIMEZONE): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !clock) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(clock[1]);
  const minute = Number(clock[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = utcGuess - timeZoneOffsetMs(new Date(utcGuess), timeZone);
  instant = utcGuess - timeZoneOffsetMs(new Date(instant), timeZone);
  const result = new Date(instant);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function formatInTimeZone(iso: string, timeZone = DEFAULT_TIMEZONE): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(parsed));
}

export type FrequencyCap = { count: number; windowDays: number };

export function sendsInsideCap(sentAt: string[], now: Date, cap: FrequencyCap): number {
  const windowStart = now.getTime() - cap.windowDays * 86_400_000;
  return sentAt.filter((stamp) => {
    const parsed = Date.parse(stamp);
    return !Number.isNaN(parsed) && parsed >= windowStart && parsed <= now.getTime();
  }).length;
}

export function frequencyCapBlocks(sentAt: string[], now: Date, cap: FrequencyCap): boolean {
  if (cap.count <= 0) return true;
  return sendsInsideCap(sentAt, now, cap) >= cap.count;
}

export type ResendMessage = {
  idempotencyKey: string;
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  tags: { name: string; value: string }[];
};

export type SendOutcome = { idempotencyKey: string; ok: true; resendId: string } | { idempotencyKey: string; ok: false; error: string };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function messageBody(message: ResendMessage) {
  return {
    from: message.from,
    to: [message.to],
    reply_to: message.replyTo || undefined,
    subject: message.subject,
    html: message.html,
    text: message.text,
    headers: message.headers,
    tags: message.tags,
  };
}

async function readResendError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `Resend returned ${response.status}`;
  } catch {
    return `Resend returned ${response.status}`;
  }
}

async function sendOne(message: ResendMessage, apiKey: string, fetchImpl: FetchLike, sleep: (ms: number) => Promise<void>): Promise<SendOutcome> {
  let attempt = 0;
  while (attempt < 4) {
    attempt += 1;
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify(messageBody(message)),
    });
    if (response.status === 429) {
      await sleep(backoffDelayMs(attempt));
      continue;
    }
    if (!response.ok) return { idempotencyKey: message.idempotencyKey, ok: false, error: await readResendError(response) };
    const body = await response.json() as { id?: string };
    if (!body.id) return { idempotencyKey: message.idempotencyKey, ok: false, error: "Resend did not return an id." };
    return { idempotencyKey: message.idempotencyKey, ok: true, resendId: body.id };
  }
  return { idempotencyKey: message.idempotencyKey, ok: false, error: "Resend rate limit persisted." };
}

/**
 * Uses Resend's batch endpoint for more than one message. A failed batch is
 * retried one address at a time so one bad recipient does not hide the rest.
 */
export async function sendResendMessages(input: {
  apiKey: string;
  messages: ResendMessage[];
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}): Promise<SendOutcome[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  if (input.messages.length === 0) return [];
  if (input.messages.length === 1) return [await sendOne(input.messages[0]!, input.apiKey, fetchImpl, sleep)];

  let attempt = 0;
  while (attempt < 4) {
    attempt += 1;
    const batchKey = createHash("sha256").update(input.messages.map((message) => message.idempotencyKey).join("|")).digest("hex");
    const response = await fetchImpl("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: apiKeyHeader(input.apiKey),
        "Content-Type": "application/json",
        "Idempotency-Key": batchKey,
      },
      body: JSON.stringify(input.messages.map(messageBody)),
    });
    if (response.status === 429) {
      await sleep(backoffDelayMs(attempt));
      continue;
    }
    if (!response.ok) {
      const outcomes: SendOutcome[] = [];
      for (const message of input.messages) outcomes.push(await sendOne(message, input.apiKey, fetchImpl, sleep));
      return outcomes;
    }
    const body = await response.json() as { data?: { id?: string }[] };
    const ids = body.data ?? [];
    if (ids.length !== input.messages.length) {
      const outcomes: SendOutcome[] = [];
      for (const message of input.messages) outcomes.push(await sendOne(message, input.apiKey, fetchImpl, sleep));
      return outcomes;
    }
    return input.messages.map((message, index) => {
      const id = ids[index]?.id;
      if (!id) return { idempotencyKey: message.idempotencyKey, ok: false as const, error: "Resend did not return an id." };
      return { idempotencyKey: message.idempotencyKey, ok: true as const, resendId: id };
    });
  }
  return input.messages.map((message) => ({ idempotencyKey: message.idempotencyKey, ok: false as const, error: "Resend rate limit persisted." }));
}

function apiKeyHeader(apiKey: string) {
  return `Bearer ${apiKey}`;
}

export function nextCampaignStatus(
  counts: { pending: number; sending: number; sent: number; failed: number },
  current: CampaignStatus,
): CampaignStatus {
  if (current === "paused" || current === "archived" || current === "draft") return current;
  if (counts.pending > 0 || counts.sending > 0) return "sending";
  if (counts.failed > 0) return "failed";
  if (counts.sent > 0 || current === "sending" || current === "scheduled") return "sent";
  return current;
}

export function confirmDecision(input: { shownFingerprint: string; actualFingerprint: string; recipientCount: number }): { ok: true } | { ok: false; error: string } {
  if (!input.shownFingerprint || input.shownFingerprint !== input.actualFingerprint) {
    return { ok: false, error: "The recipient list changed. Review it again before scheduling." };
  }
  if (input.recipientCount <= 0) {
    return { ok: false, error: "No one with marketing consent matches. Nothing was scheduled." };
  }
  return { ok: true };
}

export function assertNotLiveSegmentSend(kind: unknown): { ok: true } | { ok: false; error: string } {
  if (kind === "test") return { ok: true };
  return { ok: false, error: "Only a test send can be requested this way." };
}
