import { getOrderById, updateOrder } from "@/lib/db";
import { ORDER_STATUS } from "@/lib/constants";
import { ensureHttps, isValidUrl } from "@/lib/validation";
import { sendPartialScanEmail } from "@/lib/email-service";
import {
  type ScanDeliveryBatch,
  isBatchDelivered,
  isMixedScanOrder,
} from "@/lib/scan-batch";
import type { FilmOrder } from "@/lib/types";

export type PartialScanDeliveryResult = {
  success: boolean;
  order_id: string;
  batch?: ScanDeliveryBatch;
  error?: string;
  email_sent?: boolean;
  emailError?: string;
};

function patchForBatch(batch: ScanDeliveryBatch, link: string, deliveredAt: string): Partial<FilmOrder> {
  if (batch === "Color") {
    return {
      color_scans_wetransfer_link: link,
      color_scans_delivered_at: deliveredAt,
    };
  }
  return {
    bw_scans_wetransfer_link: link,
    bw_scans_delivered_at: deliveredAt,
  };
}

export async function recordPartialScanDelivery({
  order_id,
  batch,
  wetransfer_link,
  send_email = true,
}: {
  order_id: string;
  batch: ScanDeliveryBatch;
  wetransfer_link: string;
  send_email?: boolean;
}): Promise<PartialScanDeliveryResult> {
  if (!order_id || !batch) {
    return { success: false, order_id, error: "order_id and batch are required" };
  }

  if (batch !== "Color" && batch !== "Black & White") {
    return { success: false, order_id, error: 'batch must be "Color" or "Black & White"' };
  }

  const raw = wetransfer_link?.trim();
  if (!raw || !isValidUrl(raw)) {
    return { success: false, order_id, error: "Please enter a valid download link" };
  }

  const link = ensureHttps(raw);
  const order = await getOrderById(order_id);
  if (!order) {
    return { success: false, order_id, error: "Order not found" };
  }

  if (!isMixedScanOrder(order)) {
    return {
      success: false,
      order_id,
      error: "Partial scan delivery is only for mixed Color and B&W orders.",
    };
  }

  if (order.status !== ORDER_STATUS.RECEIVED_AT_LAB) {
    return {
      success: false,
      order_id,
      error: 'Partial scans can only be recorded while the order is "Received at Lab".',
    };
  }

  if (isBatchDelivered(order, batch)) {
    return {
      success: false,
      order_id,
      error: `${batch} scans were already marked as sent for this order.`,
    };
  }

  const deliveredAt = new Date().toISOString();
  await updateOrder(order_id, patchForBatch(batch, link, deliveredAt));

  if (!send_email) {
    return { success: true, order_id, batch, email_sent: false };
  }

  try {
    const emailData = await sendPartialScanEmail(order_id, batch);
    return {
      success: true,
      order_id,
      batch,
      email_sent: !emailData.skipped,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error";
    return {
      success: true,
      order_id,
      batch,
      email_sent: false,
      emailError: message,
    };
  }
}
