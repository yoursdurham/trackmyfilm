/**
 * POST /api/email
 * Sends transactional emails via Resend using inline HTML templates.
 *
 * Templates:
 *   film_drop_received — confirmation when film is dropped off
 *   film_at_lab        — film has arrived at the lab in Raleigh
 *   scans_sent         — scans ready with WeTransfer link
 *
 * Dedup: each template has a per-order timestamp field. Will not resend within 1 hour.
 */

import { NextResponse } from "next/server";
import { getOrderById, updateOrder } from "@/lib/db";
import { normalizeEmail, isWithinDedupWindow } from "@/lib/validation";
import { requireAuth } from "@/lib/api-auth";
import type { FilmOrder } from "@/lib/types";

const TEMPLATE_IDS: Record<string, string | undefined> = {
  film_drop_received: process.env.RESEND_TEMPLATE_FILM_DROP_RECEIVED,
  film_at_lab:        process.env.RESEND_TEMPLATE_FILM_AT_LAB,
  scans_sent:         process.env.RESEND_TEMPLATE_SCANS_SENT,
};

// Maps template name → dedup timestamp field on the order
const DEDUP_FIELDS: Record<string, keyof FilmOrder> = {
  film_drop_received: "received_email_sent_at",
  film_at_lab:        "at_lab_email_sent_at",
  scans_sent:         "scans_sent_email_sent_at",
};

const KNOWN_TEMPLATES = Object.keys(DEDUP_FIELDS);

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  let order_id: string, template: string;
  try {
    ({ order_id, template } = await req.json() as { order_id: string; template: string });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!order_id || !template) {
    return NextResponse.json({ error: "order_id and template are required" }, { status: 400 });
  }

  if (!KNOWN_TEMPLATES.includes(template)) {
    return NextResponse.json(
      { error: `Unknown template "${template}". Valid: ${KNOWN_TEMPLATES.join(", ")}` },
      { status: 400 }
    );
  }

  const order = await getOrderById(order_id);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Resolve recipient
  const recipientEmail = order.customer_email ? normalizeEmail(order.customer_email) : null;
  if (!recipientEmail) {
    return NextResponse.json({ error: "Order has no customer email — cannot send" }, { status: 400 });
  }

  // Dedup check — skip if sent within the last hour
  const dedupField = DEDUP_FIELDS[template];
  const lastSent = order[dedupField] as string | undefined;
  if (isWithinDedupWindow(lastSent)) {
    return NextResponse.json({ success: true, skipped: true, reason: "Already sent within the last hour" });
  }

  const templateId = TEMPLATE_IDS[template];
  if (!templateId) {
    return NextResponse.json(
      { error: `Template ID not configured for "${template}" — add it to .env` },
      { status: 500 }
    );
  }

  // Build template variables (must match {{variable}} names in Resend dashboard)
  const variables: Record<string, string> = {
    first_name:   (order.customer_name || "there").trim().split(" ")[0],
    order_number: order.order_number ?? "",
    roll_count:   String(order.roll_count ?? 0),
  };

  if (template === "scans_sent") {
    variables.wetransfer_link = order.wetransfer_link ?? "";
  }

  // Send via Resend using dashboard template
  const payload = {
    from:     process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
    to:       [recipientEmail],
    reply_to: process.env.REPLY_TO_EMAIL || "hello@yoursdurham.com",
    template: {
      id:        templateId,
      variables,
    },
  };

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resendData = await resendRes.json() as { id?: string; message?: string; name?: string };

  if (!resendRes.ok) {
    const errorMsg = resendData.message ?? JSON.stringify(resendData);
    console.error("[email] Resend rejected request:", JSON.stringify(resendData, null, 2));
    await updateOrder(order_id, {
      email_status: "failed",
      email_error:  `${resendData.name ?? "ResendError"}: ${errorMsg}`,
    });
    return NextResponse.json(
      { error: `${resendData.name ?? "ResendError"}: ${errorMsg}`, details: resendData },
      { status: 502 }
    );
  }

  // Record success — write dedup timestamp
  const now = new Date().toISOString();
  await updateOrder(order_id, {
    [dedupField]: now,
    email_status: "sent",
    email_error:  null,
  });

  return NextResponse.json({
    success: true,
    emailId: resendData.id,
    template,
    sentTo:  recipientEmail,
  });
}
