import type { FilmOrder, RollDetail } from "./types";
import { isProcessOnlyOrder, isProcessOnlyRoll } from "./order-service";

/** Scan delivery batch for mixed Color + B&W orders */
export type ScanDeliveryBatch = "Color" | "Black & White";

export type PartialScanProgress = {
  batch: ScanDeliveryBatch;
  label: string;
  delivered: boolean;
  deliveredAt: string | null;
  /** Staff-only; omit on public tracking responses */
  wetransferLink?: string;
};

function normalizeProcess(process?: string | null): "color" | "bw" | "both" | "other" {
  if (!process) return "other";
  const normalized = process.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized === "color" || normalized === "c" || normalized === "c41") return "color";
  if (
    normalized.includes("blackandwhite") ||
    normalized.includes("blackwhite") ||
    normalized === "bw"
  ) {
    return "bw";
  }
  if (normalized === "both") return "both";
  return "other";
}

function processesFromRoll(roll: RollDetail): ("color" | "bw")[] {
  const kind = normalizeProcess(roll.film_process);
  if (kind === "color") return ["color"];
  if (kind === "bw") return ["bw"];
  if (kind === "both") return ["color", "bw"];
  return [];
}

/** Scannable rolls exclude Process Only. */
export function getScannableRollProcesses(order: FilmOrder): Set<"color" | "bw"> {
  const set = new Set<"color" | "bw">();

  if (order.roll_details?.length) {
    for (const roll of order.roll_details) {
      if (isProcessOnlyRoll(roll)) continue;
      for (const p of processesFromRoll(roll)) set.add(p);
    }
    if (set.size > 0) return set;
  }

  if (normalizeProcess(order.film_process) === "both") {
    set.add("color");
    set.add("bw");
    return set;
  }
  if (normalizeProcess(order.film_process) === "color") set.add("color");
  if (normalizeProcess(order.film_process) === "bw") set.add("bw");

  return set;
}

export function isMixedScanOrder(order: FilmOrder): boolean {
  if (isProcessOnlyOrder(order)) return false;
  const processes = getScannableRollProcesses(order);
  return processes.has("color") && processes.has("bw");
}

export function batchDeliveredAt(order: FilmOrder, batch: ScanDeliveryBatch): string | null | undefined {
  return batch === "Color" ? order.color_scans_delivered_at : order.bw_scans_delivered_at;
}

export function batchWetransferLink(order: FilmOrder, batch: ScanDeliveryBatch): string | null | undefined {
  return batch === "Color" ? order.color_scans_wetransfer_link : order.bw_scans_wetransfer_link;
}

export function isBatchDelivered(order: FilmOrder, batch: ScanDeliveryBatch): boolean {
  return Boolean(batchDeliveredAt(order, batch) && batchWetransferLink(order, batch));
}

export function isPartialScanDeliveryComplete(order: FilmOrder): boolean {
  if (!isMixedScanOrder(order)) return true;
  return isBatchDelivered(order, "Color") && isBatchDelivered(order, "Black & White");
}

export function getPartialScanProgress(order: FilmOrder): PartialScanProgress[] {
  if (!isMixedScanOrder(order)) return [];

  return (["Color", "Black & White"] as const).map((batch) => ({
    batch,
    label: batch === "Color" ? "Color scans" : "B&W scans",
    delivered: isBatchDelivered(order, batch),
    deliveredAt: batchDeliveredAt(order, batch) ?? null,
    wetransferLink: batchWetransferLink(order, batch) ?? undefined,
  }));
}

export function pendingBatchLabel(order: FilmOrder, afterBatch: ScanDeliveryBatch): string {
  const other: ScanDeliveryBatch = afterBatch === "Color" ? "Black & White" : "Color";
  return other === "Color" ? "Color" : "B&W";
}

export function scansSentBlockedReason(order: FilmOrder, force: boolean): string | null {
  if (force || !isMixedScanOrder(order)) return null;
  if (order.status === "Scans Sent") return null;
  if (!isPartialScanDeliveryComplete(order)) {
    const progress = getPartialScanProgress(order);
    const waiting = progress.filter((p) => !p.delivered).map((p) => p.label).join(" and ");
    return `Send partial scans for ${waiting || "remaining batches"} before marking the whole order Scans Sent.`;
  }
  return null;
}
