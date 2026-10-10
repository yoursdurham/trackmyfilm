import type { FilmOrder, FilmProcess, FilmType, OrderStatus, RollDetail } from "@/lib/types";
import { isProcessOnlyOrder } from "@/lib/order-service";
import {
  batchDeliveredAt,
  isBatchDelivered,
  isMixedScanOrder,
  type ScanDeliveryBatch,
} from "@/lib/scan-batch";

export type PublicScanProgress = {
  batch: ScanDeliveryBatch;
  delivered: boolean;
  deliveredAt: string | null;
};

export type PublicRollDetail = {
  film_type: FilmType;
  film_process: FilmProcess;
  film_stock?: string;
  prints_4x6?: boolean;
  scan_size?: RollDetail["scan_size"];
};

/** Shown on public tracking while an order is parked. The staff reason stays off this payload. */
export const PUBLIC_ON_HOLD_MESSAGE = "We're checking on this order";

/**
 * Timeline highlight for the tracking page. On Hold is not a pipeline step,
 * so the page keeps the last normal status and shows PUBLIC_ON_HOLD_MESSAGE.
 */
export function publicTimelineStatus(
  order: Pick<PublicTrackingOrder, "status" | "status_history">,
): OrderStatus | null {
  if (order.status !== "On Hold") return order.status;
  const prior = [...order.status_history].reverse().find((entry) => entry.status !== "On Hold");
  return prior?.status ?? null;
}

/** Fields the public tracking page renders. Nothing else leaves the server. */
export type PublicTrackingOrder = {
  id: string;
  order_number: string;
  first_name: string | null;
  status: OrderStatus;
  status_history: { status: OrderStatus; changed_at: string }[];
  dropoff_date: string;
  roll_count: number;
  film_type: FilmType;
  film_process: FilmProcess;
  film_stock?: string;
  prints_4x6?: boolean;
  roll_details?: PublicRollDetail[];
  notes?: string;
  process_only: boolean;
  scan_progress: PublicScanProgress[];
};

function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

function publicRoll(roll: RollDetail): PublicRollDetail {
  const next: PublicRollDetail = {
    film_type: roll.film_type,
    film_process: roll.film_process,
  };
  if (roll.film_stock) next.film_stock = roll.film_stock;
  if (roll.prints_4x6) next.prints_4x6 = true;
  if (roll.scan_size) next.scan_size = roll.scan_size;
  return next;
}

function publicScanProgress(order: FilmOrder): PublicScanProgress[] {
  if (!isMixedScanOrder(order)) return [];
  return (["Color", "Black & White"] as const).map((batch) => {
    const delivered = isBatchDelivered(order, batch);
    return {
      batch,
      delivered,
      deliveredAt: delivered ? (batchDeliveredAt(order, batch) ?? null) : null,
    };
  });
}

/**
 * Allowlist for public tracking. Download URLs stay off this payload; the page
 * only tells the customer that a link was emailed.
 */
export function serializeOrderForPublicTracking(order: FilmOrder): PublicTrackingOrder {
  const note = orderNoteForCustomerDisplay(order.notes);
  const rolls = order.roll_details?.map(publicRoll).filter((roll) => roll.film_type && roll.film_process);
  const publicOrder: PublicTrackingOrder = {
    id: order.id,
    order_number: order.order_number,
    first_name: firstName(order.customer_name),
    status: order.status,
    status_history: (order.status_history ?? [])
      .filter((entry) => entry?.status && entry.changed_at)
      .map((entry) => ({
        status: entry.status,
        changed_at: entry.changed_at,
      })),
    dropoff_date: order.dropoff_date,
    roll_count: order.roll_count,
    film_type: order.film_type,
    film_process: order.film_process,
    process_only: isProcessOnlyOrder(order),
    scan_progress: publicScanProgress(order),
  };

  if (order.film_stock) publicOrder.film_stock = order.film_stock;
  if (order.prints_4x6) publicOrder.prints_4x6 = true;
  if (rolls && rolls.length > 0) publicOrder.roll_details = rolls;
  if (note) publicOrder.notes = note;
  return publicOrder;
}

export function orderNoteForCustomerDisplay(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function customerFirstName(firstNameValue?: string | null): string | null {
  return firstName(firstNameValue);
}
