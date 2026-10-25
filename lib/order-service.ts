import { ORDER_STATUS, STATUS_TEMPLATE_MAP } from "./constants";
import type { FilmOrder, OrderStatus } from "./types";

/** Enough of an order to tell Process Only from Scans Only. */
export type ServiceTypeOrder = {
  roll_details?: readonly unknown[] | null;
  scan_size?: string | null;
  scan_type?: string | null;
  scan_option?: string | null;
  resolution?: string | null;
};

function normalizeScanSize(scanSize?: string | null) {
  return scanSize?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
}

function isScansOnlyValue(scanSize?: string | null) {
  const normalized = normalizeScanSize(scanSize);
  return normalized === "scansonly" || normalized === "scanonly" || normalized === "scanningonly";
}

function sizedRolls(details: readonly unknown[] | null | undefined) {
  const sized: { scan_size?: string | null }[] = [];
  if (!details) return sized;
  for (const roll of details) {
    if (!roll || typeof roll !== "object") continue;
    const scanSize = (roll as { scan_size?: string | null }).scan_size;
    if (typeof scanSize === "string" && scanSize.trim()) sized.push({ scan_size: scanSize });
  }
  return sized;
}

function everyRollIs(order: ServiceTypeOrder, kind: "processonly" | "scansonly") {
  if (order.roll_details?.length) {
    const sized = sizedRolls(order.roll_details);
    if (sized.length > 0) {
      return sized.length === order.roll_details.length &&
        sized.every((roll) => (
          kind === "scansonly" ? isScansOnlyValue(roll.scan_size) : normalizeScanSize(roll.scan_size) === kind
        ));
    }
  }

  return [order.scan_size, order.scan_type, order.scan_option, order.resolution]
    .some((value) => (
      kind === "scansonly" ? isScansOnlyValue(value) : normalizeScanSize(value) === kind
    ));
}

export function isProcessOnlyRoll(roll: { scan_size?: string | null }) {
  return normalizeScanSize(roll.scan_size) === "processonly";
}

export function isScansOnlyRoll(roll: { scan_size?: string | null }) {
  return isScansOnlyValue(roll.scan_size);
}

export function isProcessOnlyOrder(order: ServiceTypeOrder) {
  return everyRollIs(order, "processonly");
}

/** Already-developed film. Every roll is Scans Only, same rule as Process Only. */
export function isScansOnlyOrder(order: ServiceTypeOrder) {
  return everyRollIs(order, "scansonly");
}

export function getStatusOptionsForOrder(order: ServiceTypeOrder): OrderStatus[] {
  const pipeline: OrderStatus[] = isProcessOnlyOrder(order)
    ? [ORDER_STATUS.RECEIVED_BY_YOURS, ORDER_STATUS.RECEIVED_AT_LAB, ORDER_STATUS.READY_FOR_PICKUP]
    : isScansOnlyOrder(order)
      ? [ORDER_STATUS.RECEIVED_BY_YOURS, ORDER_STATUS.SCANS_SENT]
      : [ORDER_STATUS.RECEIVED_BY_YOURS, ORDER_STATUS.RECEIVED_AT_LAB, ORDER_STATUS.SCANS_SENT];
  return [...pipeline, ORDER_STATUS.ON_HOLD];
}

/** Status email, with Scans Only completion using its own template. */
export function emailTemplateForStatus(order: FilmOrder, status: OrderStatus): string | undefined {
  if (status === ORDER_STATUS.SCANS_SENT && isScansOnlyOrder(order)) return "scans_only_ready";
  return STATUS_TEMPLATE_MAP[status];
}
