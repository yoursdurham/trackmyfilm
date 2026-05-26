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
import { EmailSendError, sendOrderEmail } from "@/lib/email-service";
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
    const detectedScanOptions = order.roll_details?.length
      ? order.roll_details.map((roll) => roll.scan_size ?? "(missing)")
      : [
        (order as typeof order & { scan_size?: string | null }).scan_size,
        (order as typeof order & { scan_type?: string | null }).scan_type,
        (order as typeof order & { scan_option?: string | null }).scan_option,
        (order as typeof order & { resolution?: string | null }).resolution,
      ].filter(Boolean);

    console.log("[status] Status update requested:", {
      orderId: order_id,
      orderNumber: order.order_number,
      previousStatus: order.status,
      newStatus: new_status,
      detectedScanOptions,
      processOnlyOrder,
      sendEmail: send_email,
      hasWetransferLink: Boolean(wetransfer_link || order.wetransfer_link),
    });

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
    const processOnlyEmailSelected =
      processOnlyOrder &&
      new_status === ORDER_STATUS.READY_FOR_PICKUP &&
      template === "process_only_finished";

    console.log("[status] Email path decision:", {
      orderId: order_id,
      orderNumber: order.order_number,
      newStatus: new_status,
      template,
      processOnlyOrder,
      processOnlyEmailSelected,
      sendEmail: send_email,
    });

    if (!template || !send_email) {
      return NextResponse.json({ success: true, order_id, new_status, email_sent: false });
    }

    try {
      const emailData = await sendOrderEmail(order_id, template);

      return NextResponse.json({
        success: true,
        order_id,
        new_status,
        email_sent: !emailData.skipped,
        emailResult: emailData,
      });
    } catch (emailErr: unknown) {
      // Email failure does not fail the status update
      console.error("[status] Email trigger failed:", {
        orderId: order_id,
        orderNumber: order.order_number,
        newStatus: new_status,
        template,
        error: emailErr instanceof Error ? emailErr.message : "Unknown email error",
      });
      await updateOrder(order_id, {
        email_status: "failed",
        email_error: emailErr instanceof Error ? emailErr.message : "Unknown email error",
      });
      return NextResponse.json({
        success: true,
        order_id,
        new_status,
        email_sent: false,
        emailError: emailErr instanceof EmailSendError ? emailErr.message : String(emailErr),
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
