import { NextResponse } from "next/server";
import { ACCOUNT_SIGN_IN_MESSAGE } from "@/lib/account-email-otp";
import { sendAccountSignInEmail } from "@/lib/account-sign-in-email";
import { customerAccountsEnabled, customerAccountTestAllowed } from "@/lib/customer-accounts";
import { staffEmailAllowlist } from "@/lib/staff-auth";
import { isValidEmail, normalizeEmail } from "@/lib/validation";

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 3;

export { ACCOUNT_SIGN_IN_MESSAGE };

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
 * Sends a magic link and a 6-digit code in the same email. The response is
 * the same when the address is unknown, has no orders, is rate-limited, or
 * the message cannot be mailed. The code is never included in this response.
 * This route does not read film_orders.
 *
 * The link is created with the service-role admin API and the message is sent
 * by this app. signInWithOtp is not used: that asks Supabase Auth to send the
 * mail, which was arriving as the old scans message.
 *
 * While CUSTOMER_ACCOUNTS_ENABLED is off, mail goes out only for
 * CUSTOMER_ACCOUNT_TESTERS and STAFF_EMAILS. Every other address gets the
 * same sentence and no mail, so the response does not reveal who is allowed.
 */
export async function POST(req: Request) {
  const email = await readEmail(req);
  if (isRateLimited(getClientIp(req))) return genericResponse();
  if (!customerAccountsEnabled() && !customerAccountTestAllowed(email)) return genericResponse();
  return sendMagicLink(req, email);
}

async function sendMagicLink(req: Request, email: string) {
  if (!isValidEmail(email)) return genericResponse();

  // An unset allowlist treats every signed-in user as staff. Don't mint a
  // public customer session until the shop has named its staff emails.
  // Hidden testing is already limited to explicit tester and staff addresses,
  // and tester addresses are never treated as staff.
  if (customerAccountsEnabled() && !staffEmailAllowlist()) {
    console.error("[account/sign-in] STAFF_EMAILS is not set, so no sign-in link was sent.");
    return genericResponse();
  }

  await sendAccountSignInEmail(email, appOrigin(req));
  return genericResponse();
}
