/**
 * Derive customer statistics from film orders (no duplicate counters on customer row).
 */

import type { FilmOrder, FilmProcess, FilmType, RollDetail } from "./types";

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

function mode<T extends string>(values: T[]): T | null {
  if (!values.length) return null;
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: T | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function getOrderRollDetails(order: FilmOrder): RollDetail[] {
  if (order.roll_details?.length) return order.roll_details;
  return [{
    film_type: order.film_type,
    film_process: order.film_process,
    film_stock: order.film_stock,
    prints_4x6: order.prints_4x6,
  }];
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

  const sorted = [...orders].sort((a, b) => {
    const aDate = a.dropoff_date || a.created_at || "";
    const bDate = b.dropoff_date || b.created_at || "";
    return bDate.localeCompare(aDate);
  });

  const filmTypes: FilmType[] = [];
  const filmProcesses: FilmProcess[] = [];
  const scanSizes: NonNullable<RollDetail["scan_size"]>[] = [];
  const turnaroundDays: number[] = [];

  for (const order of orders) {
    const turnaround = getTurnaroundDays(order);
    if (turnaround !== null) turnaroundDays.push(turnaround);

    for (const roll of getOrderRollDetails(order)) {
      if (roll.film_type) filmTypes.push(roll.film_type);
      if (roll.film_process) filmProcesses.push(roll.film_process);
      if (roll.scan_size) scanSizes.push(roll.scan_size);
    }
  }

  const avgTurnaround = turnaroundDays.length
    ? Math.round(turnaroundDays.reduce((sum, d) => sum + d, 0) / turnaroundDays.length)
    : null;

  const last = sorted[0];

  return {
    total_orders: orders.length,
    total_rolls: orders.reduce((sum, o) => sum + (o.roll_count || 0), 0),
    last_order_date: last.dropoff_date || last.created_at || null,
    average_turnaround_days: avgTurnaround,
    common_film_type: mode(filmTypes),
    common_film_process: mode(filmProcesses),
    common_scan_size: mode(scanSizes),
  };
}

export function buildCustomerStatsMap(orders: FilmOrder[]): Map<string, CustomerOrderStats> {
  const byCustomer = new Map<string, FilmOrder[]>();
  for (const order of orders) {
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
