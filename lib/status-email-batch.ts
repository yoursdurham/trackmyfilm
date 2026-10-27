import { createHash } from "crypto";
import { Resend } from "resend";
import { updateOrder } from "@/lib/db";
import type { OrderEmailPayload } from "@/lib/email-service";
import type { FilmOrder } from "@/lib/types";

/** Resend's default plan allows about 2 requests per second. One batch call covers up to 100 emails. */
export const STATUS_EMAIL_BATCH_SIZE = 100;
const REQUEST_GAP_MS = 500;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

export const statusEmailBatchTiming = {
  async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  },
};

export type StatusEmailJob = {
  orderId: string;
  orderNumber?: string;
  /** Stable for this order and this status move. Retries of the same move reuse it. */
  idempotencyKey: string;
  dedupField?: keyof FilmOrder;
  payload: OrderEmailPayload;
};

export type StatusEmailSendResult = {
  orderId: string;
  orderNumber?: string;
  sent: boolean;
  skipped?: boolean;
  error?: string;
};

type BatchError = {
  name?: string;
  message?: string;
  statusCode?: number | null;
};

type BatchBody = {
  data?: { id?: string | null }[] | null;
  errors?: { index: number; message: string }[];
};

/**
 * Resend stores one Idempotency-Key per HTTP request. A batch therefore sends
 * one key that is a hash of the per-order keys, so a retry of the same orders
 * and status move replays the original response instead of sending again.
 */
export function orderStatusIdempotencyKey(orderId: string, status: string, anchor: string): string {
  const digest = createHash("sha256").update(`${orderId}:${status}:${anchor}`).digest("hex");
  return `tmf-${digest.slice(0, 48)}`;
}

export function batchIdempotencyKey(orderKeys: string[]): string {
  const digest = createHash("sha256").update([...orderKeys].sort().join("\n")).digest("hex");
  return `tmf-batch-${digest.slice(0, 48)}`;
}

function chunkKey(jobs: StatusEmailJob[]): string {
  const keys = jobs.map((job) => job.idempotencyKey);
  return keys.length === 1 ? keys[0] : batchIdempotencyKey(keys);
}

function errorMessage(error: BatchError | null | undefined, fallback: string): string {
  if (!error) return fallback;
  const name = error.name ? `${error.name}: ` : "";
  return `${name}${error.message ?? fallback}`;
}

function isRateLimited(error: BatchError | null | undefined): boolean {
  if (!error) return false;
  if (error.statusCode === 429 || error.name === "rate_limit_exceeded") return true;
  const message = error.message?.toLowerCase() ?? "";
  return message.includes("rate limit") || message.includes("too many requests");
}

function isRetryable(error: BatchError | null | undefined): boolean {
  if (!error) return false;
  if (isRateLimited(error)) return true;
  if (error.statusCode == null) return true;
  return error.statusCode >= 500;
}

function outcomesFromBatch(count: number, body: BatchBody | null, error: BatchError | null): StatusEmailSendResult[] {
  if (error || !body) {
    const message = errorMessage(error, "Resend batch failed");
    return Array.from({ length: count }, () => ({ orderId: "", sent: false, error: message }));
  }

  const errors = body.errors ?? [];
  const ids = body.data ?? [];
  const failed = new Map(errors.map((entry) => [entry.index, entry.message]));
  const aligned = ids.length === count;

  let cursor = 0;
  return Array.from({ length: count }, (_, index) => {
    const message = failed.get(index);
    if (message) return { orderId: "", sent: false, error: message };
    const id = aligned ? ids[index]?.id : ids[cursor++]?.id;
    if (!id) return { orderId: "", sent: false, error: "Email was not accepted" };
    return { orderId: "", sent: true };
  });
}

async function recordSent(job: StatusEmailJob): Promise<string | undefined> {
  const now = new Date().toISOString();
  let lastError = "Could not save the sent time";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await updateOrder(job.orderId, {
        ...(job.dedupField ? { [job.dedupField]: now } : {}),
        email_status: "sent",
        email_error: null,
      });
      return undefined;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown email bookkeeping error";
      if (attempt < 2) await statusEmailBatchTiming.sleep(200);
    }
  }
  console.error("[email] Status email was accepted but the sent time was not saved:", {
    orderId: job.orderId,
    error: lastError,
  });
  return "Email was accepted but the sent time could not be saved. Retry to record it.";
}

async function sendChunk(resend: Resend, jobs: StatusEmailJob[]): Promise<StatusEmailSendResult[]> {
  const idempotencyKey = chunkKey(jobs);
  const payload = jobs.map((job) => ({
    from: job.payload.from,
    to: job.payload.to,
    replyTo: job.payload.reply_to,
    template: job.payload.template,
  }));

  let lastError: BatchError | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const response = await resend.batch.send(payload, {
      idempotencyKey,
      batchValidation: "permissive",
    });
    const error = response.error as BatchError | null;
    if (!isRetryable(error)) {
      const outcomes = outcomesFromBatch(jobs.length, response.data as BatchBody | null, error);
      return Promise.all(outcomes.map(async (outcome, index) => {
        const job = jobs[index];
        if (!outcome.sent) {
          return { orderId: job.orderId, orderNumber: job.orderNumber, sent: false, error: outcome.error };
        }
        const recordError = await recordSent(job);
        if (recordError) {
          return { orderId: job.orderId, orderNumber: job.orderNumber, sent: false, error: recordError };
        }
        return { orderId: job.orderId, orderNumber: job.orderNumber, sent: true };
      }));
    }

    lastError = error;
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) break;
    console.error("[email] Resend batch rate limited, retrying:", {
      attempt: attempt + 1,
      orders: jobs.length,
      error: errorMessage(error, "rate limit"),
    });
    await statusEmailBatchTiming.sleep(delay);
  }

  const message = errorMessage(lastError, "Resend rate limit exceeded");
  return jobs.map((job) => ({
    orderId: job.orderId,
    orderNumber: job.orderNumber,
    sent: false,
    error: message,
  }));
}

export async function sendStatusEmailBatch(jobs: StatusEmailJob[]): Promise<StatusEmailSendResult[]> {
  if (jobs.length === 0) return [];

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return jobs.map((job) => ({
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      sent: false,
      error: "RESEND_API_KEY not configured",
    }));
  }

  const resend = new Resend(apiKey);
  const results: StatusEmailSendResult[] = [];
  for (let index = 0; index < jobs.length; index += STATUS_EMAIL_BATCH_SIZE) {
    if (index > 0) await statusEmailBatchTiming.sleep(REQUEST_GAP_MS);
    const chunk = jobs.slice(index, index + STATUS_EMAIL_BATCH_SIZE);
    results.push(...await sendChunk(resend, chunk));
  }
  return results;
}
