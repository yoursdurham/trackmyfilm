/**
 * POST /api/email
 * Single source of truth for sending transactional emails via Resend.
 * Mirrors the logic from film-flow's sendStatusEmail.ts
 */

import { NextResponse } from "next/server";
import { getOrderById, updateOrder } from "@/lib/db";
import { normalizeEmail, isWithinDedupWindow } from "@/lib/validation";
import { requireAuth } from "@/lib/api-auth";

const DEDUP_FIELDS: Record<string, keyof import("@/lib/types").FilmOrder> = {
  film_drop_received: "received_email_sent_at",
  film_at_lab: "at_lab_email_sent_at",
  scans_sent: "scans_sent_email_sent_at",
};

const TEMPLATE_ENV_KEYS: Record<string, string> = {
  film_drop_received: "RESEND_TEMPLATE_FILM_DROP_RECEIVED",
  film_at_lab: "RESEND_TEMPLATE_FILM_TO_RALEIGH",
  scans_sent: "RESEND_TEMPLATE_SCANS_SENT",
};

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { order_id, template } = await req.json() as { order_id: string; template: string };

    if (!order_id || !template) {
      return NextResponse.json({ error: "order_id and template are required" }, { status: 400 });
    }

    const order = await getOrderById(order_id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Resolve recipient email
    const recipientEmail = order.customer_email ? normalizeEmail(order.customer_email) : null;
    if (!recipientEmail) {
      return NextResponse.json({ error: "No recipient email" }, { status: 400 });
    }

    // Dedup: skip if already sent within the last hour
    const dedupField = DEDUP_FIELDS[template];
    const lastSent = dedupField ? order[dedupField] as string | undefined : undefined;
    if (isWithinDedupWindow(lastSent)) {
      return NextResponse.json({ success: true, skipped: true, message: "Email already sent recently" });
    }

    // Resolve Resend template ID
    const envKey = TEMPLATE_ENV_KEYS[template];
    const resendTemplateId = envKey ? process.env[envKey] : undefined;
    if (!resendTemplateId) {
      return NextResponse.json({ error: `Template ID not configured: ${template}` }, { status: 500 });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
      return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
    }

    const firstName = (order.customer_name || "there").trim().split(" ")[0];
    const now = new Date().toISOString();

    const payload = {
      from: "TrackMyFilm <no-reply@trackmyfilm.com>",
      to: [recipientEmail],
      reply_to: process.env.REPLY_TO_EMAIL || "hello@yoursdurham.com",
      template: {
        id: resendTemplateId,
        variables: {
          first_name: firstName,
          roll_count: String(order.roll_count ?? ""),
          order_number: String(order.order_number ?? ""),
          film_type: String(order.film_type ?? ""),
          film_process: String(order.film_process ?? ""),
          tracking_url: process.env.NEXT_PUBLIC_APP_URL
            ? `${process.env.NEXT_PUBLIC_APP_URL}/tracking`
            : "https://trackmyfilm.com/tracking",
          wetransfer_link: order.wetransfer_link?.trim() || null,
          last_updated: now,
        },
      },
    };

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      await updateOrder(order_id, { email_status: "failed", email_error: JSON.stringify(resendData) });
      return NextResponse.json({ error: "Resend error", details: resendData }, { status: 500 });
    }

    // Write dedup timestamp
    if (dedupField) {
      await updateOrder(order_id, { [dedupField]: now, email_status: "sent" } as never);
    }

    return NextResponse.json({ success: true, emailId: resendData.id, template });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
