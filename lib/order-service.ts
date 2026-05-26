import type { FilmOrder, RollDetail } from "./types";

function normalizeScanSize(scanSize?: string | null) {
  return scanSize?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
}

export function isProcessOnlyRoll(roll: Pick<RollDetail, "scan_size">) {
  return normalizeScanSize(roll.scan_size) === "processonly";
}

export function isProcessOnlyOrder(order: FilmOrder) {
  if (order.roll_details?.length) {
    return order.roll_details.every(isProcessOnlyRoll);
  }

  const legacyOrder = order as FilmOrder & {
    scan_size?: string | null;
    scan_type?: string | null;
  };

  return (
    normalizeScanSize(legacyOrder.scan_size) === "processonly" ||
    normalizeScanSize(legacyOrder.scan_type) === "processonly"
  );
}

export function getStatusOptionsForOrder(order: FilmOrder) {
  return isProcessOnlyOrder(order)
    ? (["Received by Yours", "Received at Lab", "Ready for Pickup"] as const)
    : (["Received by Yours", "Received at Lab", "Scans Sent"] as const);
}
