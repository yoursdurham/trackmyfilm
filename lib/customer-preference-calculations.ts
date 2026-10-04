import type { FilmOrder, FilmProcess, FilmType, RollDetail } from "./types";
import { getOrderRollDetails } from "./order-roll-utils";

export type CalculatedPreference<T extends string> = {
  value: T | null;
  /** Roll-level selections counted toward this preference. */
  sampleCount: number;
  totalOrders: number;
  helper: string | null;
};

type WeightedValue<T extends string> = {
  value: T;
  orderSortKey: string;
};

function orderSortKey(order: FilmOrder): string {
  return order.dropoff_date || order.created_at || order.status_updated_at || "";
}

function processesForRoll(roll: RollDetail): Array<Exclude<FilmProcess, "Both">> {
  if (roll.film_process === "Both") return ["Color", "Black & White"];
  if (roll.film_process === "Color" || roll.film_process === "Black & White") {
    return [roll.film_process];
  }
  return [];
}

function pickModeWithRecency<T extends string>(entries: WeightedValue<T>[]): T | null {
  if (!entries.length) return null;

  const counts = new Map<T, number>();
  for (const entry of entries) {
    counts.set(entry.value, (counts.get(entry.value) ?? 0) + 1);
  }

  let maxCount = 0;
  for (const count of counts.values()) {
    if (count > maxCount) maxCount = count;
  }

  const tied = [...counts.entries()].filter(([, c]) => c === maxCount).map(([v]) => v);
  if (tied.length === 1) return tied[0];

  const sorted = [...entries].sort((a, b) => b.orderSortKey.localeCompare(a.orderSortKey));
  for (const entry of sorted) {
    if (tied.includes(entry.value)) return entry.value;
  }
  return tied[0] ?? null;
}

function buildCalculated<T extends string>(
  entries: WeightedValue<T>[],
  totalOrders: number,
): CalculatedPreference<T> {
  const value = pickModeWithRecency(entries);
  const sampleCount = entries.length;
  if (!value || sampleCount === 0) {
    return { value: null, sampleCount: 0, totalOrders, helper: null };
  }
  const count = entries.filter((e) => e.value === value).length;
  const helper =
    totalOrders > 0
      ? `Used in ${count} of ${sampleCount} roll${sampleCount === 1 ? "" : "s"} (${totalOrders} order${totalOrders === 1 ? "" : "s"})`
      : null;
  return { value, sampleCount, totalOrders, helper };
}

export function computeCalculatedPreferences(orders: FilmOrder[]): {
  film_type: CalculatedPreference<FilmType>;
  film_process: CalculatedPreference<Exclude<FilmProcess, "Both">>;
  scan_size: CalculatedPreference<NonNullable<RollDetail["scan_size"]>>;
} {
  const totalOrders = orders.length;
  const filmTypes: WeightedValue<FilmType>[] = [];
  const filmProcesses: WeightedValue<Exclude<FilmProcess, "Both">>[] = [];
  const scanSizes: WeightedValue<NonNullable<RollDetail["scan_size"]>>[] = [];

  for (const order of orders) {
    const sortKey = orderSortKey(order);
    for (const roll of getOrderRollDetails(order)) {
      if (roll.film_type) {
        filmTypes.push({ value: roll.film_type, orderSortKey: sortKey });
      }
      for (const process of processesForRoll(roll)) {
        filmProcesses.push({ value: process, orderSortKey: sortKey });
      }
      if (roll.scan_size) {
        scanSizes.push({ value: roll.scan_size, orderSortKey: sortKey });
      }
    }
  }

  return {
    film_type: buildCalculated(filmTypes, totalOrders),
    film_process: buildCalculated(filmProcesses, totalOrders),
    scan_size: buildCalculated(scanSizes, totalOrders),
  };
}

export function orderProcessSummary(order: FilmOrder): string {
  const processes = new Set<string>();
  for (const roll of getOrderRollDetails(order)) {
    for (const p of processesForRoll(roll)) processes.add(p);
  }
  if (processes.has("Color") && processes.has("Black & White")) return "Mixed";
  if (processes.size === 1) return [...processes][0];
  return order.film_process ?? "";
}
