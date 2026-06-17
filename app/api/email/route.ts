/**
 * POST /api/email
 * Sends transactional emails via Resend dashboard templates.
 *
 * Templates:
 *   film_drop_received — confirmation when film is dropped off
 *   film_at_lab        — film has arrived at the lab in Raleigh
 *   process_only_finished — process-only negatives are ready
 *   scans_sent         — scans ready with WeTransfer link
 *   film_delay         — film has been at the lab 8+ days without movement
 *
 * Dedup: each template has a per-order timestamp field. Will not resend within 1 hour.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { EmailSendError, KNOWN_EMAIL_TEMPLATES, sendOrderEmail } from "@/lib/email-service";

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  let order_id: string, template: string;
  try {
    ({ order_id, template } = await req.json() as { order_id: string; template: string });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!order_id || !template) {
    return NextResponse.json({ error: "order_id and template are required" }, { status: 400 });
  }

  if (!(KNOWN_EMAIL_TEMPLATES as string[]).includes(template)) {
    return NextResponse.json(
      { error: `Unknown template "${template}". Valid: ${KNOWN_EMAIL_TEMPLATES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const emailData = await sendOrderEmail(order_id, template);
    return NextResponse.json(emailData);
  } catch (error) {
    if (error instanceof EmailSendError) {
      const body: { error: string; details?: unknown } = { error: error.message };
      if (error.details) body.details = error.details;
      return NextResponse.json(body, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown email error" },
      { status: 500 }
    );
  }
}
