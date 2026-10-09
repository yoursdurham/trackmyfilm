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

const SHORT_WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

/**
 * Next Tuesday or Friday at 12:00 PM America/New_York.
 * On a run day the instant stays at today's noon until that moment passes.
 */
export function nextLabRunAt(now: Date): Date {
  const { weekdays, hour, minute } = FILM_METRICS_CONFIG.labRuns;
  const today = calendarInShopZone(now);
  const runDays = new Set<number>(weekdays);

  for (let offset = 0; offset < 8; offset += 1) {
    const date = addCalendarDays(today.year, today.month, today.day, offset);
    if (!runDays.has(date.weekdayIndex)) continue;
    const instant = shopWallTimeToUtc(date.year, date.month, date.day, hour, minute);
    if (instant.getTime() < now.getTime()) continue;
    return instant;
  }

  const fallback = addCalendarDays(today.year, today.month, today.day, 7);
  return shopWallTimeToUtc(fallback.year, fallback.month, fallback.day, hour, minute);
}

/**
 * Next Tuesday or Friday at 12:00 PM America/New_York.
 * On a run day the label stays "Today 12:00 PM" through noon, then rolls forward.
 */
export function nextLabRunLabel(now: Date): string {
  const { hour, minute } = FILM_METRICS_CONFIG.labRuns;
  const clock = formatClock(hour, minute);
  const today = calendarInShopZone(now);
  const next = calendarInShopZone(nextLabRunAt(now));
  if (next.key === today.key) return `Today ${clock}`;
  return `${WEEKDAY_NAMES[next.weekdayIndex]} ${clock}`;
}

/** Short banner for the airport board, e.g. "FRI 12:00 PM". */
export function nextLabRunBoardLabel(now: Date): string {
  const { hour, minute } = FILM_METRICS_CONFIG.labRuns;
  const next = calendarInShopZone(nextLabRunAt(now));
  return `${SHORT_WEEKDAYS[next.weekdayIndex]} ${formatClock(hour, minute)}`;
}

export interface ShopCalendarDate {
  year: number;
  month: number;
  day: number;
}

/** Calendar date in America/New_York. */
export function shopCalendarDate(date: Date): ShopCalendarDate {
  const parts = calendarInShopZone(date);
  return { year: parts.year, month: parts.month, day: parts.day };
}

export interface ShopClock extends ShopCalendarDate {
  hour: number;
  minute: number;
  weekdayIndex: number;
  /** YYYY-MM-DD in America/New_York. */
  key: string;
}

/** Wall clock in America/New_York. */
export function shopClock(date: Date): ShopClock {
  const parts = calendarInShopZone(date);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    weekdayIndex: parts.weekdayIndex,
    key: parts.key,
  };
}

/** Noon in America/New_York. Noon is never a DST gap. */
export function shopNoonUtc(year: number, month: number, day: number): Date {
  return shopWallTimeToUtc(year, month, day, 12, 0);
}

/**
 * Most recent Tuesday or Friday at 12:00 PM America/New_York that is not after `now`.
 * Before noon on a run day, this is the previous run.
 */
export function lastLabRunAt(now: Date): Date {
  const { weekdays, hour, minute } = FILM_METRICS_CONFIG.labRuns;
  const today = calendarInShopZone(now);
  const runDays = new Set<number>(weekdays);

  for (let offset = 0; offset < 8; offset += 1) {
    const date = addCalendarDays(today.year, today.month, today.day, -offset);
    if (!runDays.has(date.weekdayIndex)) continue;
    const instant = shopWallTimeToUtc(date.year, date.month, date.day, hour, minute);
    if (instant.getTime() <= now.getTime()) return instant;
  }

  const fallback = addCalendarDays(today.year, today.month, today.day, -7);
  return shopWallTimeToUtc(fallback.year, fallback.month, fallback.day, hour, minute);
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

export interface RollCountSource {
  roll_count?: number | null;
  roll_details?: readonly unknown[] | null;
}

function positiveRollCount(order: RollCountSource): number {
  if (typeof order.roll_count === "number" && Number.isFinite(order.roll_count) && order.roll_count > 0) {
    return Math.floor(order.roll_count);
  }
  return FILM_METRICS_CONFIG.fallbackRollCount;
}

/** Every physical roll on the order, including develop-only rolls. */
export function rollsOnOrder(order: RollCountSource): number {
  if (Array.isArray(order.roll_details) && order.roll_details.length > 0) return order.roll_details.length;
  return positiveRollCount(order);
}

/**
 * Scanned rolls only. A Process Only order contributes nothing.
 * Mixed orders count the rolls that are not Process Only.
 * Orders with no roll details use the existing roll count unless the order is Process Only.
 */
function scannedRollsOnOrder(order: FilmOrder): number {
  if (isProcessOnlyOrder(order)) return 0;
  if (order.roll_details?.length) {
    let scanned = 0;
    for (const roll of order.roll_details) {
      if (isProcessOnlyRoll(roll)) continue;
      scanned += 1;
    }
    return scanned;
  }
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
    if (IN_PROCESS.has(order.status)) rollsProcessing += scannedRollsOnOrder(order);

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

/**
 * Columns computeFilmMetrics actually reads. Names, emails, notes, order
 * numbers, and transfer links stay in the database.
 * Legacy received_at_lab_at and order-level scan columns are read in memory
 * when present, but they are not selected: a missing column fails the query.
 */
export const FILM_METRICS_ORDER_SELECT = [
  "status",
  "roll_count",
  "roll_details",
  "film_process",
  "received_by_yours_at",
  "dropoff_date",
  "created_at",
  "at_lab_at",
  "scans_sent_at",
  "color_scans_delivered_at",
  "bw_scans_delivered_at",
  "status_history",
  "status_updated_at",
].join(", ");

/**
 * In-process rows, plus anything received or finished inside this window.
 * Thirty days of turnaround, a Sunday-start week, and a little slack.
 */
export const FILM_METRICS_LOOKBACK_DAYS = 45;

export interface FilmMetricsOrderSource {
  status?: string | null;
  received_by_yours_at?: string | null;
  dropoff_date?: string | null;
  created_at?: string | null;
  at_lab_at?: string | null;
  scans_sent_at?: string | null;
  color_scans_delivered_at?: string | null;
  bw_scans_delivered_at?: string | null;
  status_updated_at?: string | null;
  status_history?: readonly { changed_at?: string | null }[] | null;
}

export function filmMetricsLookbackStart(now: Date): Date {
  return new Date(now.getTime() - FILM_METRICS_LOOKBACK_DAYS * MS_PER_DAY);
}

function onOrAfter(value: string | null | undefined, cutoffMs: number): boolean {
  const date = parseTimestamp(value);
  return Boolean(date && date.getTime() >= cutoffMs);
}

/**
 * True when an order can change a film-stats number.
 * In-process orders always count, even when they were received long ago.
 * A recent status_history entry counts too, so a scans-sent row that only
 * has a history date is kept in an in-memory comparison. The SQL filter uses
 * status_updated_at for that case, because status updates write both together.
 */
export function orderAffectsFilmMetrics(order: FilmMetricsOrderSource, now: Date): boolean {
  if (order.status === ORDER_STATUS.RECEIVED_BY_YOURS || order.status === ORDER_STATUS.RECEIVED_AT_LAB) {
    return true;
  }
  const cutoff = filmMetricsLookbackStart(now);
  const cutoffMs = cutoff.getTime();
  const stamps = [
    order.received_by_yours_at,
    order.created_at,
    order.scans_sent_at,
    order.color_scans_delivered_at,
    order.bw_scans_delivered_at,
    order.at_lab_at,
    order.status_updated_at,
  ];
  if (stamps.some((value) => onOrAfter(value, cutoffMs))) return true;
  if (order.status_history?.some((entry) => onOrAfter(entry?.changed_at, cutoffMs))) return true;
  if (typeof order.dropoff_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(order.dropoff_date)) {
    const parts = shopCalendarDate(cutoff);
    const key = calendarKey(parts.year, parts.month, parts.day);
    if (order.dropoff_date >= key) return true;
  }
  return false;
}

/** PostgREST `or` filter matching the column half of orderAffectsFilmMetrics. */
export function filmMetricsOrderOrFilter(now: Date): string {
  const since = filmMetricsLookbackStart(now).toISOString();
  const parts = shopCalendarDate(filmMetricsLookbackStart(now));
  const dropoff = calendarKey(parts.year, parts.month, parts.day);
  return [
    `status.eq."${ORDER_STATUS.RECEIVED_BY_YOURS}"`,
    `status.eq."${ORDER_STATUS.RECEIVED_AT_LAB}"`,
    `received_by_yours_at.gte.${since}`,
    `created_at.gte.${since}`,
    `scans_sent_at.gte.${since}`,
    `color_scans_delivered_at.gte.${since}`,
    `bw_scans_delivered_at.gte.${since}`,
    `at_lab_at.gte.${since}`,
    `status_updated_at.gte.${since}`,
    `dropoff_date.gte.${dropoff}`,
  ].join(",");
}
