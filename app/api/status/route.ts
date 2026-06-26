/**
 * POST /api/status
 * Updates an order's status, writes status_history, sets per-status timestamps,
 * and triggers a Resend email via /api/email.
 */

import { NextResponse } from "next/server";
import { getOrderById } from "@/lib/db";
import { STATUS_FLOW } from "@/lib/constants";
import { isProcessOnlyOrder } from "@/lib/order-service";
import { isKnownStatus } from "@/lib/validation";
import { requireAuth } from "@/lib/api-auth";
import { updateOrderStatus } from "@/lib/status-update-service";
import type { OrderStatus } from "@/lib/types";

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

    const result = await updateOrderStatus({
      order_id,
      new_status,
      wetransfer_link,
      force,
      send_email,
    });

    if (!result.success) {
      const statusCode = result.requiresForce ? 422 : 400;
      if (result.error === "Order not found") {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      return NextResponse.json({
        success: false,
        error: result.error,
        requiresForce: result.requiresForce,
      }, { status: statusCode });
    }

    return NextResponse.json({
      success: true,
      order_id: result.order_id,
      new_status: result.new_status,
      skipped: result.skipped,
      reason: result.reason,
      email_sent: result.email_sent,
      emailError: result.emailError,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
