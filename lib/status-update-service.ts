import { getOrderById, updateOrder } from "@/lib/db";
import { ORDER_STATUS, STATUS_TEMPLATE_MAP } from "@/lib/constants";
import { normalizeHoldReason } from "@/lib/hold-reason";
import { isProcessOnlyOrder } from "@/lib/order-service";
import { isMixedScanOrder, isPartialScanDeliveryComplete, scansSentBlockedReason } from "@/lib/scan-batch";
import { isValidTransition, isKnownStatus, isValidUrl, ensureHttps } from "@/lib/validation";
import { scanNotesForStorage } from "@/lib/scan-notes";
import { EmailSendError, sendOrderEmail } from "@/lib/email-service";
import type { FilmOrder, OrderStatus, StatusHistoryEntry } from "@/lib/types";

const HOLD_REASON_MIGRATION_WARNING =
  "Order is On Hold. The reason was not saved because the hold_reason column is missing. Run migration 020_add_order_hold_reason.sql in Supabase.";

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
  warning?: string;
};

function missingColumn(message: string, column: string): boolean {
  return message.includes(column) && message.includes("schema cache");
}

/**
 * Saves the status patch. If scan_notes or hold_reason is not in the database
 * yet, the status change still lands and that field is left untouched.
 */
async function saveOrderUpdate(
  orderId: string,
  updateData: Partial<FilmOrder>,
): Promise<{ holdReasonDropped: boolean }> {
  const payload: Partial<FilmOrder> = { ...updateData };
  let holdReasonDropped = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await updateOrder(orderId, payload);
      return { holdReasonDropped };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      let stripped = false;

      if (payload.scan_notes !== undefined && missingColumn(message, "scan_notes")) {
        console.error(
          "[status] scan_notes column missing — run migration 014_add_scan_notes.sql. Saving status without scan note."
        );
        delete payload.scan_notes;
        stripped = true;
      }

      if (payload.hold_reason !== undefined && missingColumn(message, "hold_reason")) {
        console.error(
          "[status] hold_reason column missing — run migration 020_add_order_hold_reason.sql. Saving status without the hold reason."
        );
        delete payload.hold_reason;
        holdReasonDropped = true;
        stripped = true;
      }

      if (!stripped) throw err;
    }
  }

  throw new Error("Could not save order status");
}

export async function updateOrderStatus({
  order_id,
  new_status,
  wetransfer_link,
  scan_notes,
  hold_reason,
  force = false,
  send_email = true,
}: {
  order_id: string;
  new_status: OrderStatus;
  wetransfer_link?: string;
  scan_notes?: string | null;
  hold_reason?: string | null;
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
    if (new_status === ORDER_STATUS.ON_HOLD && hold_reason !== undefined) {
      const normalized = normalizeHoldReason(hold_reason);
      if (normalized.error) {
        return { success: false, order_id, error: normalized.error };
      }
      const currentReason = order.hold_reason?.trim() || null;
      if (normalized.reason === currentReason) {
        return {
          success: true,
          order_id,
          new_status,
          skipped: true,
          reason: "Already at this status",
        };
      }
      const saved = await saveOrderUpdate(order_id, { hold_reason: normalized.reason });
      return {
        success: true,
        order_id,
        new_status,
        email_sent: false,
        warning: saved.holdReasonDropped && normalized.reason
          ? HOLD_REASON_MIGRATION_WARNING
          : undefined,
      };
    }
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

  const blockedReason = scansSentBlockedReason(order, force);
  if (new_status === ORDER_STATUS.SCANS_SENT && blockedReason) {
    return { success: false, order_id, error: blockedReason };
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
  if (new_status === ORDER_STATUS.ON_HOLD) {
    const normalized = normalizeHoldReason(hold_reason);
    if (normalized.error) {
      return { success: false, order_id, error: normalized.error };
    }
    updateData.hold_reason = normalized.reason;
  } else {
    updateData.hold_reason = null;
  }

  if (new_status === ORDER_STATUS.SCANS_SENT) {
    updateData.scans_sent_at = now;
    if (scan_notes !== undefined) {
      updateData.scan_notes = scanNotesForStorage(scan_notes);
    }
    if (isMixedScanOrder(order) && isPartialScanDeliveryComplete(order)) {
      const fallback =
        order.bw_scans_wetransfer_link ||
        order.color_scans_wetransfer_link ||
        order.wetransfer_link;
      const rawLink = wetransfer_link || fallback;
      updateData.wetransfer_link = rawLink ? ensureHttps(rawLink) : rawLink;
    } else {
      const rawLink = wetransfer_link || order.wetransfer_link;
      updateData.wetransfer_link = rawLink ? ensureHttps(rawLink) : rawLink;
    }
  }

  const saved = await saveOrderUpdate(order_id, updateData);
  const holdWarning =
    saved.holdReasonDropped && updateData.hold_reason
      ? HOLD_REASON_MIGRATION_WARNING
      : undefined;

  const template = STATUS_TEMPLATE_MAP[new_status];
  if (!template || !send_email) {
    return { success: true, order_id, new_status, email_sent: false, warning: holdWarning };
  }

  const scanNotesForSendEmail =
    new_status === ORDER_STATUS.SCANS_SENT && scan_notes !== undefined
      ? scanNotesForStorage(scan_notes)
      : undefined;

  try {
    const emailData = await sendOrderEmail(order_id, template, {
      scanNotes: scanNotesForSendEmail,
    });
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
