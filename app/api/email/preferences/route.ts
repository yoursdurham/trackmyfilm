import { NextResponse } from "next/server";
import { consentUpdate } from "@/lib/marketing/audience";
import { verifyUnsubscribeToken } from "@/lib/marketing/messages";
import { setConsent, subscriptionFor } from "@/lib/marketing/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const secret = process.env.MARKETING_UNSUBSCRIBE_SECRET?.trim() ?? "";
  const payload = verifyUnsubscribeToken(new URL(req.url).searchParams.get("token") ?? "", secret);
  if (!payload) return NextResponse.json({ error: "This link is not valid." }, { status: 400 });
  try {
    const subscription = await subscriptionFor(payload.email);
    return NextResponse.json({
      email: payload.email,
      status: subscription?.status ?? "none",
      consentedAt: subscription?.consented_at ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load preferences.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const secret = process.env.MARKETING_UNSUBSCRIBE_SECRET?.trim() ?? "";
  const body = await req.json().catch(() => null) as { token?: unknown; status?: unknown; explicit?: unknown } | null;
  const payload = verifyUnsubscribeToken(typeof body?.token === "string" ? body.token : "", secret);
  if (!payload) return NextResponse.json({ error: "This link is not valid." }, { status: 400 });
  const decision = consentUpdate({ status: body?.status, explicit: body?.explicit });
  if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: 400 });
  if (decision.status === "suppressed") {
    return NextResponse.json({ error: "Use unsubscribe or subscribe." }, { status: 400 });
  }
  try {
    await setConsent({
      email: payload.email,
      customerId: null,
      status: decision.status,
      reason: null,
      source: "preference_page",
      actor: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save that preference.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status: decision.status });
}
