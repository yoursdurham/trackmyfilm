/**
 * POST /api/email
 * Sends transactional emails via Resend using inline HTML templates.
 * No Resend template IDs required.
 *
 * Templates:
 *   film_drop_received — auto-upgrades to loyalty_5 or loyalty_10 based on dropoff_number
 *   film_at_lab        — film has arrived at the lab
 *   scans_sent         — scans ready with WeTransfer link
 *
 * Dedup: each template has a per-order timestamp field. Will not resend within 1 hour.
 */

import { NextResponse } from "next/server";
import { getOrderById, updateOrder } from "@/lib/db";
import { normalizeEmail, isWithinDedupWindow } from "@/lib/validation";
import { requireAuth } from "@/lib/api-auth";
import {
  filmDropReceived,
  filmDropLoyalty5,
  filmDropLoyalty10,
  filmAtLab,
  scansSent,
} from "@/lib/email-templates";
import type { FilmOrder } from "@/lib/types";

// Maps template name → which dedup field to read/write
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

  // Build email params
  const firstName  = (order.customer_name || "there").trim().split(" ")[0];
  const rollCount  = order.roll_count ?? 0;
  const filmType   = order.film_type ?? "";
  const filmProcess = order.film_process ?? "";
  const orderNumber = order.order_number ?? "";
  const dropoffNumber = order.dropoff_number ?? 0;

  // Resolve which email to build
  let email: { subject: string; html: string };

  if (template === "film_drop_received") {
    // Auto-upgrade to loyalty email at 5th and 10th milestones
    if (dropoffNumber === 10) {
      email = filmDropLoyalty10({ firstName, rollCount, filmType, filmProcess, orderNumber });
    } else if (dropoffNumber === 5) {
      email = filmDropLoyalty5({ firstName, rollCount, filmType, filmProcess, orderNumber });
    } else {
      email = filmDropReceived({ firstName, rollCount, filmType, filmProcess, orderNumber });
    }
  } else if (template === "film_at_lab") {
    email = filmAtLab({ firstName, rollCount, filmType, filmProcess, orderNumber });
  } else if (template === "scans_sent") {
    if (!order.wetransfer_link) {
      return NextResponse.json({ error: "Cannot send scans_sent email: no WeTransfer link on order" }, { status: 400 });
    }
    email = scansSent({ firstName, rollCount, filmType, filmProcess, orderNumber, wetransferLink: order.wetransfer_link });
  } else {
    return NextResponse.json({ error: `Unhandled template: ${template}` }, { status: 500 });
  }

  // Send via Resend
  const payload = {
    from:     process.env.RESEND_FROM_EMAIL || "Yours Durham <no-reply@yoursdurham.com>",
    to:       [recipientEmail],
    reply_to: process.env.REPLY_TO_EMAIL || "hello@yoursdurham.com",
    subject:  email.subject,
    html:     email.html,
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
    // Record failure on order — never silently swallow
    await updateOrder(order_id, {
      email_status: "failed",
      email_error:  `${resendData.name ?? "ResendError"}: ${resendData.message ?? JSON.stringify(resendData)}`,
    });
    return NextResponse.json(
      { error: "Resend API error", details: resendData },
      { status: 502 }
    );
  }

  // Record success — write dedup timestamp
  const now = new Date().toISOString();
  await updateOrder(order_id, {
    [dedupField]:   now,
    email_status:   "sent",
    email_error:    null,
  } as never);

  return NextResponse.json({
    success:    true,
    emailId:    resendData.id,
    template,
    variant:    template === "film_drop_received"
      ? (dropoffNumber === 10 ? "loyalty_10" : dropoffNumber === 5 ? "loyalty_5" : "regular")
      : template,
    sentTo:     recipientEmail,
  });
}
