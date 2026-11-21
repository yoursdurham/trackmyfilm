import { NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/marketing/messages";
import { setConsent } from "@/lib/marketing/store";

export const runtime = "nodejs";

function tokenFrom(req: Request) {
  return new URL(req.url).searchParams.get("token") ?? "";
}

/** Mail-client one-click. A normal browser visit uses GET and does not unsubscribe. */
export async function POST(req: Request) {
  const secret = process.env.MARKETING_UNSUBSCRIBE_SECRET?.trim() ?? "";
  const payload = verifyUnsubscribeToken(tokenFrom(req), secret);
  if (!payload) return NextResponse.json({ error: "This unsubscribe link is not valid." }, { status: 400 });
  try {
    await setConsent({
      email: payload.email,
      customerId: null,
      status: "unsubscribed",
      reason: null,
      source: "unsubscribe_link",
      actor: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not unsubscribe.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = new URL("/email/preferences", url.origin);
  const token = url.searchParams.get("token");
  if (token) next.searchParams.set("token", token);
  return NextResponse.redirect(next);
}
