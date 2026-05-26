import type { OrderStatus } from "./types";

export const ORDER_STATUS = {
  RECEIVED_BY_YOURS: "Received by Yours" as OrderStatus,
  RECEIVED_AT_LAB: "Received at Lab" as OrderStatus,
  READY_FOR_PICKUP: "Ready for Pickup" as OrderStatus,
  SCANS_SENT: "Scans Sent" as OrderStatus,
} as const;

export const STATUS_FLOW: OrderStatus[] = [
  ORDER_STATUS.RECEIVED_BY_YOURS,
  ORDER_STATUS.RECEIVED_AT_LAB,
  ORDER_STATUS.READY_FOR_PICKUP,
  ORDER_STATUS.SCANS_SENT,
];

// Maps order status to Resend template name
export const STATUS_TEMPLATE_MAP: Partial<Record<OrderStatus, string>> = {
  [ORDER_STATUS.RECEIVED_BY_YOURS]: "film_drop_received",
  [ORDER_STATUS.RECEIVED_AT_LAB]: "film_at_lab",
  [ORDER_STATUS.READY_FOR_PICKUP]: "process_only_finished",
  [ORDER_STATUS.SCANS_SENT]: "scans_sent",
};
