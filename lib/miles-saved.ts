import { FILM_METRICS_CONFIG } from "@/lib/film-metrics-config";
import { shopCalendarDate } from "@/lib/film-metrics";
import { LEGACY_2026_SHEET_DROPOFFS } from "@/lib/legacy-rolls";

/** Miles a customer does not drive when they drop film in Durham instead of Raleigh. */
export const MILES_PER_DROPOFF = 32;

/** Mean Earth circumference in miles. One lap of the progress ring. */
export const EARTH_CIRCUMFERENCE_MILES = 24_901;

/** Shop drives to the lab this many times per week, all year. */
export const LAB_RUNS_PER_WEEK = 2;

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Sheet drop-offs belong to 2026 only. Later years are entirely in film_orders. */
const LEGACY_SHEET_YEAR = 2026;

export interface PublicMilesSaved {
  miles: number;
  laps: number;
  year: number;
}

export interface ShopYearWindow {
  year: number;
  start: Date;
  startIso: string;
  endIso: string;
}

function zonedParts(date: Date, timeZone: string) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const bag: Record<string, string> = {};
  for (const part of formatted) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

/** Midnight in America/New_York. Midnight is not in the DST gap. */
export function shopMidnight(year: number, month: number, day: number): Date {
  const timeZone = FILM_METRICS_CONFIG.timezone;
  let utc = Date.UTC(year, month - 1, day, 5, 0, 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedParts(new Date(utc), timeZone);
    const got = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const want = Date.UTC(year, month - 1, day, 0, 0, 0);
    const diff = want - got;
    utc += diff;
    if (diff === 0) break;
  }
  return new Date(utc);
}

/** Jan 1 00:00 through the next Jan 1 00:00 in the shop timezone. */
export function shopYearWindow(now: Date): ShopYearWindow {
  const { year } = shopCalendarDate(now);
  const start = shopMidnight(year, 1, 1);
  const end = shopMidnight(year + 1, 1, 1);
  return {
    year,
    start,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

/**
 * Whole lab runs since Jan 1, at two per elapsed week.
 * A run counts once half a week has passed, then another every half week.
 * Partial time at the end of the span does not add a run.
 */
export function labRunsElapsed(now: Date, yearStart: Date): number {
  const elapsed = now.getTime() - yearStart.getTime();
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
  return Math.floor((elapsed / MS_PER_WEEK) * LAB_RUNS_PER_WEEK);
}

/** Sheet drop-offs for this shop year. 2026 includes the pre-app sheet gap. */
export function legacyDropoffsForYear(year: number): number {
  return year === LEGACY_SHEET_YEAR ? LEGACY_2026_SHEET_DROPOFFS : 0;
}

/**
 * All-time miles, same formula as the homepage without the shop-year window.
 * Drop-offs are every film order plus the 2026 sheet gap (479), the only
 * pre-app baseline the homepage adds. The larger pre-2026 sheet total is for
 * roll counts, not miles. Lab runs stay two per elapsed week, counted from
 * Jan 1, 2026 instead of resetting each January.
 */
export function allTimeMiles(input: { ordersCreated: number; now: Date }): { miles: number; laps: number } {
  return toPublicMiles({
    legacyDropoffs: legacyDropoffsForYear(LEGACY_SHEET_YEAR),
    ordersCreated: input.ordersCreated,
    labRuns: labRunsElapsed(input.now, shopMidnight(LEGACY_SHEET_YEAR, 1, 1)),
  });
}

/**
 * Public miles and laps only. Trip and order counts stay in the arguments
 * and are not returned.
 */
export function toPublicMiles(input: {
  legacyDropoffs: number;
  ordersCreated: number;
  labRuns: number;
}): { miles: number; laps: number } {
  const trips = Math.max(0, input.legacyDropoffs + input.ordersCreated - input.labRuns);
  const miles = trips * MILES_PER_DROPOFF;
  return { miles, laps: miles / EARTH_CIRCUMFERENCE_MILES };
}

/**
 * The homepage lap is miles divided by the Earth's circumference.
 * The globe caption rounds that to one decimal once it reaches a full lap.
 * This is the same ratio, kept to two decimals for the public API.
 */
export function roundLaps(laps: number): number {
  if (!Number.isFinite(laps) || laps <= 0) return 0;
  return Math.round(laps * 100) / 100;
}

/** Laps rounded the way the caption and the ring both read. */
export function displayLaps(laps: number): number {
  if (!Number.isFinite(laps) || laps <= 0) return 0;
  if (laps < 1) return Math.round(laps * 100) / 100;
  return Math.round(laps * 10) / 10;
}

export function formatMiles(miles: number): string {
  const rounded = Number.isFinite(miles) ? Math.max(0, Math.round(miles)) : 0;
  return new Intl.NumberFormat("en-US").format(rounded);
}

export function lapsCaption(laps: number): string {
  const shown = displayLaps(laps);
  if (shown < 1) {
    return `That's ${Math.round(shown * 100)}% of the way around the Earth.`;
  }
  const label = Number.isInteger(shown) ? String(shown) : shown.toFixed(1);
  const noun = shown === 1 ? "time" : "times";
  return `That's ${label} ${noun} around the Earth.`;
}

/**
 * One entry per ring, inner ring first.
 * 0.4 → [0.4], 1 → [1], 1.4 → [1, 0.4]. A full lap is its own ring.
 * The fractional lap, when there is one, is the outer ring.
 */
export function lapRings(laps: number): number[] {
  const shown = displayLaps(laps);
  const full = Math.floor(shown);
  const fraction = Math.round((shown - full) * 1000) / 1000;
  const rings = Array.from({ length: full }, () => 1);
  if (fraction > 0 || rings.length === 0) rings.push(fraction);
  return rings;
}
