import { ORDER_STATUS } from "@/lib/constants";
import type { FilmOrder, OrderStatus } from "@/lib/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type OrderWithLegacyLabTimestamp = FilmOrder & {
  received_at_lab_at?: string | null;
};

export type TurnaroundPeriodKey = "all" | "7d" | "30d" | "90d" | "365d";

const PERIOD_DAYS: Record<Exclude<TurnaroundPeriodKey, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
};

export type TurnaroundPeriodStats = {
  averageDays: number | null;
  orderCount: number;
};

function parseTimestamp(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getFirstStatusDate(order: FilmOrder, status: OrderStatus): Date | null {
  if (!order.status_history?.length) return null;

  const entry = order.status_history.find((item) => item.status === status);
  return parseTimestamp(entry?.changed_at);
}

/** First time the order was marked Received at Lab. */
export function getReceivedAtLabDate(order: FilmOrder): Date | null {
  const legacyOrder = order as OrderWithLegacyLabTimestamp;
  const direct = parseTimestamp(order.at_lab_at ?? legacyOrder.received_at_lab_at ?? null);
  if (direct) return direct;

  return getFirstStatusDate(order, ORDER_STATUS.RECEIVED_AT_LAB);
}

/** First time the order was marked Scans Sent. */
export function getScansSentDate(order: FilmOrder): Date | null {
  const direct = parseTimestamp(order.scans_sent_at);
  if (direct) return direct;

  return getFirstStatusDate(order, ORDER_STATUS.SCANS_SENT);
}

export function getTurnaroundDays(order: FilmOrder): number | null {
  const receivedAtLab = getReceivedAtLabDate(order);
  const scansSent = getScansSentDate(order);
  if (!receivedAtLab || !scansSent) return null;

  const diffMs = scansSent.getTime() - receivedAtLab.getTime();
  if (diffMs < 0) return null;

  return diffMs / MS_PER_DAY;
}

function isWithinPeriod(scansSent: Date, period: TurnaroundPeriodKey, now = new Date()): boolean {
  if (period === "all") return true;

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - PERIOD_DAYS[period]);
  return scansSent >= cutoff;
}

export function calculateTurnaroundForPeriod(
  orders: FilmOrder[],
  period: TurnaroundPeriodKey,
  now = new Date()
): TurnaroundPeriodStats {
  const completed = orders
    .map((order) => {
      const scansSent = getScansSentDate(order);
      const turnaroundDays = getTurnaroundDays(order);
      if (!scansSent || turnaroundDays === null) return null;
      if (!isWithinPeriod(scansSent, period, now)) return null;
      return turnaroundDays;
    })
    .filter((days): days is number => days !== null);

  const orderCount = completed.length;
  const averageDays = orderCount
    ? completed.reduce((sum, days) => sum + days, 0) / orderCount
    : null;

  return { averageDays, orderCount };
}

export function formatTurnaroundDays(days: number | null): string {
  if (days === null) return "—";
  return `${(Math.round(days * 10) / 10).toFixed(1)} days`;
}
