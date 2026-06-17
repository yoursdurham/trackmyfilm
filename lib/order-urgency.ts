import type { FilmOrder } from "./types";

const URGENT_DAYS = 8;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type OrderWithLegacyLabTimestamp = FilmOrder & {
  received_at_lab_at?: string | null;
};

export function daysSince(dateValue?: string | null) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.floor((Date.now() - timestamp) / MS_PER_DAY);
}

export function getUrgentAgeDays(order: FilmOrder) {
  if (order.status === "Received by Yours") {
    return daysSince(order.created_at ?? order.dropoff_date);
  }

  if (order.status === "Received at Lab") {
    const legacyOrder = order as OrderWithLegacyLabTimestamp;
    return daysSince(order.at_lab_at ?? legacyOrder.received_at_lab_at ?? null);
  }

  return null;
}

export function isUrgent(order: FilmOrder) {
  if (order.status === "Scans Sent" || order.status === "Ready for Pickup") return false;
  const ageDays = getUrgentAgeDays(order);
  return ageDays !== null && ageDays >= URGENT_DAYS;
}

/** Urgent specifically because film has sat at the lab 8+ days without movement. */
export function isLabDelayUrgent(order: FilmOrder) {
  if (order.status !== "Received at Lab") return false;
  const ageDays = getUrgentAgeDays(order);
  return ageDays !== null && ageDays >= URGENT_DAYS;
}
