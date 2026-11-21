import { NextResponse } from "next/server";
import { recordWebhook } from "@/lib/marketing/store";
import { interpretResendWebhook, verifyResendWebhook } from "@/lib/marketing/webhook";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim() ?? "";
  const body = await req.text();
  const verified = verifyResendWebhook({
    secret,
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"),
    body,
  });
  if (!verified.ok) return NextResponse.json({ error: verified.reason }, { status: 401 });
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Webhook body was not JSON." }, { status: 400 });
  }
  const notice = interpretResendWebhook(payload);
  if ("error" in notice) return NextResponse.json({ error: notice.error }, { status: 400 });
  if (notice.kind === "ignore") return NextResponse.json({ ok: true, ignored: notice.eventType });
  try {
    const result = await recordWebhook(req.headers.get("svix-id") ?? "", payload, notice);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not record the webhook.";
    console.error("[resend webhook]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
