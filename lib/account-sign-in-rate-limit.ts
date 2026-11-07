import { createClient } from "@supabase/supabase-js";
import { isValidEmail, normalizeEmail } from "@/lib/validation";

export const ACCOUNT_SIGN_IN_RATE_LIMIT_WINDOW_SECONDS = 60;
export const ACCOUNT_SIGN_IN_RATE_LIMIT_MAX = 3;

const MAX_BUCKET_LENGTH = 320;
const WINDOW_MS = ACCOUNT_SIGN_IN_RATE_LIMIT_WINDOW_SECONDS * 1000;

type MemoryEntry = {
  count: number;
  resetAt: number;
};

type DurableResult = "allowed" | "limited" | "unavailable";

export type DurableRateLimit = (input: {
  ipBucket: string;
  emailBucket: string;
}) => Promise<DurableResult>;

const memory = new Map<string, MemoryEntry>();
let loggedDurableFailure = false;

/** Clears the per-instance fallback. Tests only. */
export function resetAccountSignInRateLimitForTests() {
  memory.clear();
  loggedDurableFailure = false;
}

function ipBucket(ip: string) {
  const trimmed = ip.trim() || "unknown";
  return `ip:${trimmed}`.slice(0, MAX_BUCKET_LENGTH);
}

function emailBucket(email: string) {
  if (!email || !isValidEmail(email)) return "";
  const bucket = `email:${normalizeEmail(email)}`;
  if (bucket.length > MAX_BUCKET_LENGTH) return "";
  return bucket;
}

/**
 * In-memory window used when the shared table cannot be reached.
 * A request over the IP limit does not also consume the email bucket.
 * Returns true when this request is over the limit.
 */
function memoryLimited(ipKey: string, emailKey: string, now = Date.now()) {
  if (consumeMemory(ipKey, now)) return true;
  if (!emailKey) return false;
  return consumeMemory(emailKey, now);
}

function consumeMemory(bucket: string, now: number) {
  const existing = memory.get(bucket);
  if (!existing || existing.resetAt <= now) {
    memory.set(bucket, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (existing.count >= ACCOUNT_SIGN_IN_RATE_LIMIT_MAX) return true;
  existing.count += 1;
  memory.set(bucket, existing);
  return false;
}

function logDurableFailure(message: string) {
  if (loggedDurableFailure) return;
  loggedDurableFailure = true;
  console.error("[account/sign-in] Durable rate limit unavailable; counting on this instance only.", message);
}

async function consumeDurableBucket(input: {
  ipBucket: string;
  emailBucket: string;
}): Promise<DurableResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    logDurableFailure("Supabase service role is not configured");
    return "unavailable";
  }

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc("consume_account_sign_in_rate_limit", {
      p_ip_bucket: input.ipBucket,
      p_email_bucket: input.emailBucket,
      p_window_seconds: ACCOUNT_SIGN_IN_RATE_LIMIT_WINDOW_SECONDS,
      p_max: ACCOUNT_SIGN_IN_RATE_LIMIT_MAX,
    });
    if (error || typeof data !== "boolean") {
      logDurableFailure(error?.message ?? "rate limit did not return a boolean");
      return "unavailable";
    }
    return data ? "limited" : "allowed";
  } catch (error) {
    logDurableFailure(error instanceof Error ? error.message : "rate limit request failed");
    return "unavailable";
  }
}

/**
 * True when this sign-in attempt is over the per-IP or per-email limit.
 * The shared database is the source of truth. If it is down or the migration
 * has not been run, this instance counts on its own so one process is still capped.
 */
export async function isAccountSignInRateLimited(
  ip: string,
  email: string,
  durable: DurableRateLimit = consumeDurableBucket,
): Promise<boolean> {
  const ipKey = ipBucket(ip);
  const emailKey = emailBucket(email);
  const result = await durable({ ipBucket: ipKey, emailBucket: emailKey });
  if (result === "unavailable") return memoryLimited(ipKey, emailKey);
  return result === "limited";
}
