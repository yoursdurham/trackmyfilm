import { NextResponse } from "next/server";
import { customerAccountsEnabled, isListedStaffEmail } from "@/lib/customer-accounts";
import { staffEmailAllowlist } from "@/lib/staff-auth";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail, normalizeEmail } from "@/lib/validation";

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 3;

export const ACCOUNT_SIGN_IN_MESSAGE =
  "Check your email for a sign-in link. It may take a minute to arrive.";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimit = new Map<string, RateLimitEntry>();

function genericResponse() {
  return NextResponse.json({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
}

/** Clears in-memory rate-limit state. Tests only. */
export function resetAccountSignInStateForTests() {
  rateLimit.clear();
}

function getClientIp(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const forwardedIp = forwardedFor?.split(",")[0]?.trim();
  return forwardedIp || req.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const existing = rateLimit.get(ip);
  if (!existing || existing.resetAt <= now) {
    rateLimit.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (existing.count >= MAX_REQUESTS_PER_WINDOW) return true;
  existing.count += 1;
  rateLimit.set(ip, existing);
  return false;
}

function appOrigin(req: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // Fall through to the request origin.
    }
  }
  return new URL(req.url).origin;
}

async function readEmail(req: Request) {
  try {
    const body = await req.json() as { email?: unknown };
    return typeof body.email === "string" ? normalizeEmail(body.email) : "";
  } catch {
    return "";
  }
}

/**
 * Sends a magic link and nothing else. While accounts are public, the response
 * is the same when the address is unknown, has no orders, is rate-limited, or
 * Supabase rejects it. This route does not read film_orders.
 *
 * While CUSTOMER_ACCOUNTS_ENABLED is off, any address that is not listed in
 * STAFF_EMAILS gets 404. A listed staff address can still request a link so
 * the shop can open /account as that email.
 */
export async function POST(req: Request) {
  if (!customerAccountsEnabled()) {
    const email = await readEmail(req);
    if (!isListedStaffEmail(email)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (isRateLimited(getClientIp(req))) return genericResponse();
    return sendMagicLink(req, email);
  }

  if (isRateLimited(getClientIp(req))) return genericResponse();
  return sendMagicLink(req, await readEmail(req));
}

async function sendMagicLink(req: Request, email: string) {
  if (!isValidEmail(email)) return genericResponse();

  // An unset allowlist treats every signed-in user as staff. Don't mint
  // customer sessions until the shop has named its staff emails.
  if (!staffEmailAllowlist()) {
    console.error("[account/sign-in] STAFF_EMAILS is not set, so no sign-in link was sent.");
    return genericResponse();
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${appOrigin(req)}/auth/confirm?next=/account`,
        shouldCreateUser: true,
      },
    });
    if (error) console.error("[account/sign-in]", error.message);
  } catch (error) {
    console.error("[account/sign-in]", error instanceof Error ? error.message : "sign-in failed");
  }

  return genericResponse();
}
