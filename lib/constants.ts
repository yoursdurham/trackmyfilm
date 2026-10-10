import type { OrderStatus } from "./types";

export const ORDER_STATUS = {
  RECEIVED_BY_YOURS: "Received by Yours" as OrderStatus,
  RECEIVED_AT_LAB: "Received at Lab" as OrderStatus,
  READY_FOR_PICKUP: "Ready for Pickup" as OrderStatus,
  SCANS_SENT: "Scans Sent" as OrderStatus,
  ON_HOLD: "On Hold" as OrderStatus,
} as const;

/** Pipeline order. On Hold is a parking status and is not a step in this list. */
export const STATUS_FLOW: OrderStatus[] = [
  ORDER_STATUS.RECEIVED_BY_YOURS,
  ORDER_STATUS.RECEIVED_AT_LAB,
  ORDER_STATUS.READY_FOR_PICKUP,
  ORDER_STATUS.SCANS_SENT,
];

/** Every status staff can store. On Hold is last because it sits outside the pipeline. */
export const KNOWN_ORDER_STATUSES: readonly OrderStatus[] = [
  ...STATUS_FLOW,
  ORDER_STATUS.ON_HOLD,
];

export function isOnHoldStatus(status: string | null | undefined): boolean {
  return status === ORDER_STATUS.ON_HOLD;
}

// Maps order status to Resend template name
export const STATUS_TEMPLATE_MAP: Partial<Record<OrderStatus, string>> = {
  [ORDER_STATUS.RECEIVED_BY_YOURS]: "film_drop_received",
  [ORDER_STATUS.RECEIVED_AT_LAB]: "film_at_lab",
  [ORDER_STATUS.READY_FOR_PICKUP]: "process_only_finished",
  [ORDER_STATUS.SCANS_SENT]: "scans_sent",
};
