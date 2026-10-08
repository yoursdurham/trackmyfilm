import { ORDER_STATUS } from "@/lib/constants";
import { FILM_METRICS_CONFIG } from "@/lib/film-metrics-config";
import { isProcessOnlyOrder, isProcessOnlyRoll } from "@/lib/order-service";
import type { FilmOrder } from "@/lib/types";
import { getReceivedAtLabDate, getScansSentDate, isTurnaroundOutlier } from "@/lib/turnaround-time";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const IN_PROCESS = new Set<string>([
  ORDER_STATUS.RECEIVED_BY_YOURS,
  ORDER_STATUS.RECEIVED_AT_LAB,
]);

export interface FilmMetrics {
  rollsProcessing: number;
  receivedToday: number;
  receivedThisWeek: number;
  scansSentToday: number;
  scansSentThisWeek: number;
  averageColorTurnaroundDays: number | null;
  averageBwTurnaroundDays: number | null;
  nextLabRun: string;
  [key: string]: number | string | null;
}

interface CalendarParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekdayIndex: number;
  key: string;
}

interface SideWeight {
  color: number;
  bw: number;
  /** One physical roll that is itself marked Both. */
  both: number;
}

interface AverageBucket {
  rolls: number;
  weightedDays: number;
}

function parseTimestamp(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calendarKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function zonedParts(date: Date, timeZone: string): Omit<CalendarParts, "key"> {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const bag: Record<string, string> = {};
  for (const part of formatted) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  const weekdayIndex = WEEKDAY_INDEX[bag.weekday];
  if (weekdayIndex === undefined) {
    throw new Error(`Unrecognized weekday "${bag.weekday}" in ${timeZone}`);
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
    weekdayIndex,
  };
}

function calendarInShopZone(date: Date): CalendarParts {
  const parts = zonedParts(date, FILM_METRICS_CONFIG.timezone);
  return { ...parts, key: calendarKey(parts.year, parts.month, parts.day) };
}

function addCalendarDays(year: number, month: number, day: number, delta: number) {
  const shifted = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekdayIndex: shifted.getUTCDay(),
  };
}

/** Wall-clock time in America/New_York as a UTC instant. Noon is never a DST gap. */
function shopWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedParts(new Date(utc), FILM_METRICS_CONFIG.timezone);
    const got = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const want = Date.UTC(year, month - 1, day, hour, minute, 0);
    const diff = want - got;
    utc += diff;
    if (diff === 0) break;
  }
  return new Date(utc);
}

function formatClock(hour: number, minute: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

/**
 * Next Tuesday or Friday at 12:00 PM America/New_York.
 * On a run day the label stays "Today 12:00 PM" through noon, then rolls forward.
 */
export function nextLabRunLabel(now: Date): string {
  const { weekdays, hour, minute } = FILM_METRICS_CONFIG.labRuns;
  const today = calendarInShopZone(now);
  const clock = formatClock(hour, minute);
  const runDays = new Set<number>(weekdays);

  for (let offset = 0; offset < 7; offset += 1) {
    const date = addCalendarDays(today.year, today.month, today.day, offset);
    if (!runDays.has(date.weekdayIndex)) continue;
    const instant = shopWallTimeToUtc(date.year, date.month, date.day, hour, minute);
    if (instant.getTime() < now.getTime()) continue;
    if (offset === 0) return `Today ${clock}`;
    return `${WEEKDAY_NAMES[date.weekdayIndex]} ${clock}`;
  }

  const fallback = weekdays[0] ?? 2;
  return `${WEEKDAY_NAMES[fallback]} ${clock}`;
}

function processKind(process?: string | null): "color" | "bw" | "both" | "other" {
  if (!process) return "other";
  const normalized = process.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized === "color" || normalized === "c" || normalized === "c41") return "color";
  if (
    normalized.includes("blackandwhite")
    || normalized.includes("blackwhite")
    || normalized === "bw"
  ) {
    return "bw";
  }
  if (normalized === "both") return "both";
  return "other";
}

function positiveRollCount(order: FilmOrder): number {
  if (typeof order.roll_count === "number" && Number.isFinite(order.roll_count) && order.roll_count > 0) {
    return Math.floor(order.roll_count);
  }
  return FILM_METRICS_CONFIG.fallbackRollCount;
}

/** Every physical roll on the order, including develop-only rolls. */
function rollsOnOrder(order: FilmOrder): number {
  if (order.roll_details?.length) return order.roll_details.length;
  return positiveRollCount(order);
}

function sideWeights(order: FilmOrder): SideWeight {
  const empty = { color: 0, bw: 0, both: 0 };
  if (isProcessOnlyOrder(order)) return empty;

  if (order.roll_details?.length) {
    const weight = { ...empty };
    for (const roll of order.roll_details) {
      if (isProcessOnlyRoll(roll)) continue;
      const kind = processKind(roll.film_process);
      if (kind === "color" || kind === "bw" || kind === "both") weight[kind] += 1;
    }
    return weight;
  }

  const count = positiveRollCount(order);
  const kind = processKind(order.film_process);
  if (kind === "color") return { color: count, bw: 0, both: 0 };
  if (kind === "bw") return { color: 0, bw: count, both: 0 };
  if (kind === "both") {
    const color = Math.ceil(count / 2);
    return { color, bw: count - color, both: 0 };
  }
  return empty;
}

function isMixedOrder(order: FilmOrder, weight: SideWeight): boolean {
  if (weight.both > 0) return true;
  if (weight.color > 0 && weight.bw > 0) return true;
  return processKind(order.film_process) === "both";
}

function earliestDate(left: Date | null, right: Date | null): Date | null {
  if (left && right) return left.getTime() <= right.getTime() ? left : right;
  return left ?? right;
}

function receivedKey(order: FilmOrder, now: Date): string | null {
  const received = parseTimestamp(order.received_by_yours_at);
  if (received) {
    if (received.getTime() > now.getTime()) return null;
    return calendarInShopZone(received).key;
  }
  if (typeof order.dropoff_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(order.dropoff_date)) {
    return order.dropoff_date;
  }
  const created = parseTimestamp(order.created_at);
  if (created) {
    if (created.getTime() > now.getTime()) return null;
    return calendarInShopZone(created).key;
  }
  return null;
}

function emptyBucket(): AverageBucket {
  return { rolls: 0, weightedDays: 0 };
}

function addTurnaround(
  bucket: AverageBucket,
  rolls: number,
  start: Date | null,
  end: Date | null,
  now: Date,
) {
  if (rolls <= 0 || !start || !end) return;
  const elapsed = end.getTime() - start.getTime();
  if (elapsed < 0 || isTurnaroundOutlier(elapsed)) return;
  if (end.getTime() > now.getTime()) return;
  const windowStart = now.getTime() - FILM_METRICS_CONFIG.turnaroundWindowDays * MS_PER_DAY;
  if (end.getTime() < windowStart) return;
  bucket.rolls += rolls;
  bucket.weightedDays += (elapsed / MS_PER_DAY) * rolls;
}

function averageDays(bucket: AverageBucket): number | null {
  if (bucket.rolls < FILM_METRICS_CONFIG.minimumTurnaroundSamples) return null;
  return Math.round((bucket.weightedDays / bucket.rolls) * 10) / 10;
}

/**
 * Customer-safe shop totals. The returned object has only aggregate numbers
 * and the next lab-run label — never names, emails, phones, or prices.
 */
export function computeFilmMetrics(orders: FilmOrder[], now = new Date()): FilmMetrics {
  const today = calendarInShopZone(now);
  const daysSinceWeekStart = (today.weekdayIndex - FILM_METRICS_CONFIG.weekStartsOn + 7) % 7;
  const weekStartDate = addCalendarDays(today.year, today.month, today.day, -daysSinceWeekStart);
  const weekStartKey = calendarKey(weekStartDate.year, weekStartDate.month, weekStartDate.day);
  const todayKey = today.key;

  let rollsProcessing = 0;
  let receivedToday = 0;
  let receivedThisWeek = 0;
  let scansSentToday = 0;
  let scansSentThisWeek = 0;
  const color = emptyBucket();
  const bw = emptyBucket();

  const countSent = (sentAt: Date | null, rolls: number) => {
    if (!sentAt || rolls <= 0 || sentAt.getTime() > now.getTime()) return;
    const key = calendarInShopZone(sentAt).key;
    if (key > todayKey) return;
    if (key === todayKey) scansSentToday += rolls;
    if (key >= weekStartKey && key <= todayKey) scansSentThisWeek += rolls;
  };

  for (const order of orders) {
    const rolls = rollsOnOrder(order);
    if (IN_PROCESS.has(order.status)) rollsProcessing += rolls;

    const received = receivedKey(order, now);
    if (received && received <= todayKey) {
      if (received === todayKey) receivedToday += rolls;
      if (received >= weekStartKey) receivedThisWeek += rolls;
    }

    const weight = sideWeights(order);
    const scansSent = getScansSentDate(order);
    const mixed = isMixedOrder(order, weight);
    const colorEnd = mixed
      ? parseTimestamp(order.color_scans_delivered_at) ?? scansSent
      : scansSent;
    const bwEnd = mixed
      ? parseTimestamp(order.bw_scans_delivered_at) ?? scansSent
      : scansSent;
    const bothEnd = earliestDate(
      parseTimestamp(order.color_scans_delivered_at),
      parseTimestamp(order.bw_scans_delivered_at),
    ) ?? scansSent;

    countSent(colorEnd, weight.color);
    countSent(bwEnd, weight.bw);
    countSent(bothEnd, weight.both);

    const started = getReceivedAtLabDate(order);
    addTurnaround(color, weight.color + weight.both, started, colorEnd, now);
    addTurnaround(bw, weight.bw + weight.both, started, bwEnd, now);
  }

  return {
    rollsProcessing,
    receivedToday,
    receivedThisWeek,
    scansSentToday,
    scansSentThisWeek,
    averageColorTurnaroundDays: averageDays(color),
    averageBwTurnaroundDays: averageDays(bw),
    nextLabRun: nextLabRunLabel(now),
  };
}
