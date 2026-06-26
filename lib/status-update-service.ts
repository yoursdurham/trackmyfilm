import { getOrderById, updateOrder } from "@/lib/db";
import { ORDER_STATUS, STATUS_TEMPLATE_MAP } from "@/lib/constants";
import { isProcessOnlyOrder } from "@/lib/order-service";
import { isValidTransition, isKnownStatus, isValidUrl, ensureHttps } from "@/lib/validation";
import { EmailSendError, sendOrderEmail } from "@/lib/email-service";
import type { FilmOrder, OrderStatus, StatusHistoryEntry } from "@/lib/types";

export type StatusUpdateResult = {
  success: boolean;
  order_id: string;
  new_status?: OrderStatus;
  skipped?: boolean;
  reason?: string;
  error?: string;
  requiresForce?: boolean;
  email_sent?: boolean;
  emailError?: string;
};

export async function updateOrderStatus({
  order_id,
  new_status,
  wetransfer_link,
  force = false,
  send_email = true,
}: {
  order_id: string;
  new_status: OrderStatus;
  wetransfer_link?: string;
  force?: boolean;
  send_email?: boolean;
}): Promise<StatusUpdateResult> {
  if (!order_id || !new_status) {
    return { success: false, order_id, error: "order_id and new_status are required" };
  }

  if (!isKnownStatus(new_status)) {
    return { success: false, order_id, error: `Invalid status: ${new_status}` };
  }

  const order = await getOrderById(order_id);
  if (!order) {
    return { success: false, order_id, error: "Order not found" };
  }

  const processOnlyOrder = isProcessOnlyOrder(order);

  if (new_status === ORDER_STATUS.SCANS_SENT && processOnlyOrder) {
    return {
      success: false,
      order_id,
      error: "Process Only orders should be marked Ready for Pickup instead.",
    };
  }

  if (new_status === ORDER_STATUS.READY_FOR_PICKUP && !processOnlyOrder) {
    return {
      success: false,
      order_id,
      error: "Ready for Pickup is only available for Process Only orders.",
    };
  }

  if (order.status === new_status) {
    return {
      success: true,
      order_id,
      new_status,
      skipped: true,
      reason: "Already at this status",
    };
  }

  if (!isValidTransition(order.status, new_status) && !force) {
    return {
      success: false,
      order_id,
      error: `Cannot move from "${order.status}" to "${new_status}". Use force: true to override.`,
      requiresForce: true,
    };
  }

  if (new_status === ORDER_STATUS.SCANS_SENT && wetransfer_link) {
    if (!isValidUrl(wetransfer_link)) {
      return { success: false, order_id, error: "Please enter a valid link" };
    }
  }

  const now = new Date().toISOString();

  const updatedHistory: StatusHistoryEntry[] = [
    ...(order.status_history ?? []),
    { status: new_status, changed_at: now },
  ];

  const updateData: Partial<FilmOrder> = {
    status: new_status,
    status_history: updatedHistory,
    status_updated_at: now,
  };

  if (new_status === ORDER_STATUS.RECEIVED_BY_YOURS) updateData.received_by_yours_at = now;
  if (new_status === ORDER_STATUS.RECEIVED_AT_LAB) updateData.at_lab_at = now;
  if (new_status === ORDER_STATUS.SCANS_SENT) {
    updateData.scans_sent_at = now;
    const rawLink = wetransfer_link || order.wetransfer_link;
    updateData.wetransfer_link = rawLink ? ensureHttps(rawLink) : rawLink;
  }

  await updateOrder(order_id, updateData);

  const template = STATUS_TEMPLATE_MAP[new_status];
  if (!template || !send_email) {
    return { success: true, order_id, new_status, email_sent: false };
  }

  try {
    const emailData = await sendOrderEmail(order_id, template);
    return {
      success: true,
      order_id,
      new_status,
      email_sent: !emailData.skipped,
    };
  } catch (emailErr: unknown) {
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
    return {
      success: true,
      order_id,
      new_status,
      email_sent: false,
      emailError: emailErr instanceof EmailSendError ? emailErr.message : String(emailErr),
    };
  }
}
