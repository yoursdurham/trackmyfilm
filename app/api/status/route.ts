/**
 * POST /api/status
 * Updates an order's status, writes status_history, sets per-status timestamps,
 * and triggers a Resend email via /api/email.
 */

import { NextResponse } from "next/server";
import { getOrderById, updateOrder } from "@/lib/db";
import { ORDER_STATUS, STATUS_TEMPLATE_MAP, STATUS_FLOW } from "@/lib/constants";
import { isProcessOnlyOrder } from "@/lib/order-service";
import { isValidTransition, isKnownStatus, isValidUrl, ensureHttps } from "@/lib/validation";
import { requireAuth } from "@/lib/api-auth";
import type { OrderStatus, StatusHistoryEntry } from "@/lib/types";

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { order_id, new_status, wetransfer_link, force = false, send_email = true } = await req.json() as {
      order_id: string;
      new_status: OrderStatus;
      wetransfer_link?: string;
      force?: boolean;
      send_email?: boolean;
    };

    if (!order_id || !new_status) {
      return NextResponse.json({ error: "order_id and new_status are required" }, { status: 400 });
    }

    if (!isKnownStatus(new_status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${STATUS_FLOW.join(", ")}` },
        { status: 400 }
      );
    }

    const order = await getOrderById(order_id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const processOnlyOrder = isProcessOnlyOrder(order);

    if (new_status === ORDER_STATUS.SCANS_SENT && processOnlyOrder) {
      return NextResponse.json(
        { error: "Process Only orders should be marked Ready for Pickup instead." },
        { status: 400 }
      );
    }

    if (new_status === ORDER_STATUS.READY_FOR_PICKUP && !processOnlyOrder) {
      return NextResponse.json(
        { error: "Ready for Pickup is only available for Process Only orders." },
        { status: 400 }
      );
    }

    // No-op if same status
    if (order.status === new_status) {
      return NextResponse.json({ success: true, order_id, new_status, skipped: true, reason: "Already at this status" });
    }

    // Transition validation — warn on backward, block unless forced
    if (!isValidTransition(order.status, new_status) && !force) {
      return NextResponse.json({
        success: false,
        error: `Cannot move from "${order.status}" to "${new_status}". Use force: true to override.`,
        requiresForce: true,
      }, { status: 422 });
    }

    // Validate download link only if one was provided
    if (new_status === ORDER_STATUS.SCANS_SENT && wetransfer_link) {
      if (!isValidUrl(wetransfer_link)) {
        return NextResponse.json(
          { error: "Please enter a valid link" },
          { status: 400 }
        );
      }
    }

    const now = new Date().toISOString();

    const updatedHistory: StatusHistoryEntry[] = [
      ...(order.status_history ?? []),
      { status: new_status, changed_at: now },
    ];

    const updateData: Partial<typeof order> = {
      status: new_status,
      status_history: updatedHistory,
      status_updated_at: now,
    };

    if (new_status === ORDER_STATUS.RECEIVED_BY_YOURS) updateData.received_by_yours_at = now;
    if (new_status === ORDER_STATUS.RECEIVED_AT_LAB)   updateData.at_lab_at = now;
    if (new_status === ORDER_STATUS.SCANS_SENT) {
      updateData.scans_sent_at = now;
      const rawLink = wetransfer_link || order.wetransfer_link;
      updateData.wetransfer_link = rawLink ? ensureHttps(rawLink) : rawLink;
    }

    await updateOrder(order_id, updateData);

    // Trigger email if a template exists and send_email is true
    const template = STATUS_TEMPLATE_MAP[new_status];
    if (!template || !send_email) {
      return NextResponse.json({ success: true, order_id, new_status, email_sent: false });
    }

    try {
      const emailRes = await fetch(new URL("/api/email", req.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": req.headers.get("cookie") || "",
        },
        body: JSON.stringify({ order_id, template }),
      });
      const emailData = await emailRes.json();

      return NextResponse.json({
        success: true,
        order_id,
        new_status,
        email_sent: !emailData.skipped && emailRes.ok,
        emailResult: emailData,
      });
    } catch (emailErr: unknown) {
      // Email failure does not fail the status update
      await updateOrder(order_id, {
        email_status: "failed",
        email_error: emailErr instanceof Error ? emailErr.message : "Unknown email error",
      });
      return NextResponse.json({ success: true, order_id, new_status, email_sent: false, emailError: String(emailErr) });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
