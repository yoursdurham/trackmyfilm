/**
 * Derive customer statistics from film orders (no duplicate counters on customer row).
 */

import { filterOperationalOrders } from "@/lib/pending-intake";
import type { FilmOrder, FilmProcess, FilmType, RollDetail } from "./types";
import { computeCalculatedPreferences } from "./customer-preference-calculations";
import { getOrderRollDetails } from "./order-roll-utils";

export { getOrderRollDetails } from "./order-roll-utils";

export type ContactMethod = "email" | "phone" | "text";
export type DeliveryPreference = "pickup" | "ship" | "email";

export interface CustomerOrderStats {
  total_orders: number;
  total_rolls: number;
  last_order_date: string | null;
  average_turnaround_days: number | null;
  common_film_type: FilmType | null;
  common_film_process: FilmProcess | null;
  common_scan_size: RollDetail["scan_size"] | null;
}

/** Prefer drop-off date, then received-by-Yours, then order created_at. */
export function orderLatestSortValue(order: FilmOrder): number {
  const raw = order.dropoff_date || order.received_by_yours_at || order.created_at;
  if (!raw) return 0;
  const parsed = Date.parse(raw.length <= 10 ? `${raw}T12:00:00` : raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function getLatestOrderDate(orders: FilmOrder[]): string | null {
  let best: FilmOrder | null = null;
  let bestTs = 0;
  for (const order of orders) {
    const ts = orderLatestSortValue(order);
    if (ts > bestTs) {
      bestTs = ts;
      best = order;
    }
  }
  if (!best || bestTs === 0) return null;
  return best.dropoff_date || best.received_by_yours_at || best.created_at || null;
}

export type CustomerListSortMode = "recent_order" | "most_orders";

type CustomerSortRow = {
  last_order_date?: string | null;
  total_orders?: number;
  first_name: string;
  last_name?: string | null;
};

function customerNameCompare(a: CustomerSortRow, b: CustomerSortRow): number {
  const aName = `${a.first_name} ${a.last_name ?? ""}`.trim();
  const bName = `${b.first_name} ${b.last_name ?? ""}`.trim();
  return aName.localeCompare(bName);
}

export function lastOrderDateSortValue(lastOrderDate: string | null | undefined): number {
  if (!lastOrderDate) return 0;
  const parsed = Date.parse(lastOrderDate.length <= 10 ? `${lastOrderDate}T12:00:00` : lastOrderDate);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Newest order first; customers without orders last; stable name tie-break. */
export function sortCustomersByLatestOrder<T extends CustomerSortRow>(customers: T[]): T[] {
  return [...customers].sort((a, b) => {
    const aTs = lastOrderDateSortValue(a.last_order_date);
    const bTs = lastOrderDateSortValue(b.last_order_date);

    const aHas = aTs > 0;
    const bHas = bTs > 0;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    if (aHas && bHas && aTs !== bTs) return bTs - aTs;

    return customerNameCompare(a, b);
  });
}

/** Most orders first; tie-break by newest order; then name. */
export function sortCustomersByMostOrders<T extends CustomerSortRow>(customers: T[]): T[] {
  return [...customers].sort((a, b) => {
    const aCount = a.total_orders ?? 0;
    const bCount = b.total_orders ?? 0;
    if (aCount !== bCount) return bCount - aCount;

    const aTs = lastOrderDateSortValue(a.last_order_date);
    const bTs = lastOrderDateSortValue(b.last_order_date);
    if (aTs !== bTs) return bTs - aTs;

    return customerNameCompare(a, b);
  });
}

export function sortCustomersForList<T extends CustomerSortRow>(
  customers: T[],
  mode: CustomerListSortMode
): T[] {
  return mode === "most_orders"
    ? sortCustomersByMostOrders(customers)
    : sortCustomersByLatestOrder(customers);
}

function getTurnaroundDays(order: FilmOrder): number | null {
  const start = order.received_by_yours_at ?? order.created_at;
  const end = order.scans_sent_at
    ?? (order.status === "Ready for Pickup" ? order.status_updated_at : null);
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return null;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function computeCustomerStats(orders: FilmOrder[]): CustomerOrderStats {
  if (!orders.length) {
    return {
      total_orders: 0,
      total_rolls: 0,
      last_order_date: null,
      average_turnaround_days: null,
      common_film_type: null,
      common_film_process: null,
      common_scan_size: null,
    };
  }

  const turnaroundDays: number[] = [];

  for (const order of orders) {
    const turnaround = getTurnaroundDays(order);
    if (turnaround !== null) turnaroundDays.push(turnaround);
  }

  const calculated = computeCalculatedPreferences(orders);

  const avgTurnaround = turnaroundDays.length
    ? Math.round(turnaroundDays.reduce((sum, d) => sum + d, 0) / turnaroundDays.length)
    : null;

  return {
    total_orders: orders.length,
    total_rolls: orders.reduce((sum, o) => sum + (o.roll_count || 0), 0),
    last_order_date: getLatestOrderDate(orders),
    average_turnaround_days: avgTurnaround,
    common_film_type: calculated.film_type.value,
    common_film_process: calculated.film_process.value,
    common_scan_size: calculated.scan_size.value,
  };
}

export function buildCustomerStatsMap(orders: FilmOrder[]): Map<string, CustomerOrderStats> {
  const byCustomer = new Map<string, FilmOrder[]>();
  for (const order of filterOperationalOrders(orders)) {
    if (!order.customer_id) continue;
    const list = byCustomer.get(order.customer_id) ?? [];
    list.push(order);
    byCustomer.set(order.customer_id, list);
  }

  const statsMap = new Map<string, CustomerOrderStats>();
  for (const [customerId, customerOrders] of byCustomer) {
    statsMap.set(customerId, computeCustomerStats(customerOrders));
  }
  return statsMap;
}
