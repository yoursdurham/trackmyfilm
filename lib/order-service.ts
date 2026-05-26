import type { FilmOrder, RollDetail } from "./types";

function normalizeScanSize(scanSize?: string | null) {
  return scanSize?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
}

export function isProcessOnlyRoll(roll: Pick<RollDetail, "scan_size">) {
  return normalizeScanSize(roll.scan_size) === "processonly";
}

export function isProcessOnlyOrder(order: FilmOrder) {
  if (order.roll_details?.length) {
    const rollsWithScanSize = order.roll_details.filter((roll) => roll.scan_size);
    if (rollsWithScanSize.length > 0) {
      return rollsWithScanSize.length === order.roll_details.length &&
        rollsWithScanSize.every(isProcessOnlyRoll);
    }
  }

  const legacyOrder = order as FilmOrder & {
    scan_size?: string | null;
    scan_type?: string | null;
    scan_option?: string | null;
    resolution?: string | null;
  };

  return (
    normalizeScanSize(legacyOrder.scan_size) === "processonly" ||
    normalizeScanSize(legacyOrder.scan_type) === "processonly" ||
    normalizeScanSize(legacyOrder.scan_option) === "processonly" ||
    normalizeScanSize(legacyOrder.resolution) === "processonly"
  );
}

export function getStatusOptionsForOrder(order: FilmOrder) {
  return isProcessOnlyOrder(order)
    ? (["Received by Yours", "Received at Lab", "Ready for Pickup"] as const)
    : (["Received by Yours", "Received at Lab", "Scans Sent"] as const);
}
