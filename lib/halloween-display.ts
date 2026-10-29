import { FILM_METRICS_CONFIG } from "@/lib/film-metrics-config";

const TIME_ZONE = FILM_METRICS_CONFIG.timezone;
const HALLOWEEN_MONTH = 10;
const HALLOWEEN_DAY = 31;

export type HalloweenCountdown =
  | { phase: "today" }
  | { phase: "countdown"; days: number; hours: number; minutes: number; seconds: number };

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(date: Date): ZonedParts {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
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

/** UTC instant for a wall-clock time in America/New_York. */
function zonedStart(year: number, month: number, day: number): Date {
  let utc = Date.UTC(year, month - 1, day, 0, 0, 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedParts(new Date(utc));
    const seen = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const wanted = Date.UTC(year, month - 1, day, 0, 0, 0);
    const delta = wanted - seen;
    if (delta === 0) break;
    utc += delta;
  }
  return new Date(utc);
}

/**
 * Countdown to midnight at the start of October 31, America/New_York.
 * On that calendar day the count is replaced by the Halloween message.
 * After the day, the count aims at the next October 31.
 */
export function halloweenCountdown(now: Date): HalloweenCountdown {
  const parts = zonedParts(now);
  if (parts.month === HALLOWEEN_MONTH && parts.day === HALLOWEEN_DAY) {
    return { phase: "today" };
  }

  let target = zonedStart(parts.year, HALLOWEEN_MONTH, HALLOWEEN_DAY);
  if (target.getTime() <= now.getTime()) {
    target = zonedStart(parts.year + 1, HALLOWEEN_MONTH, HALLOWEEN_DAY);
  }

  const totalSeconds = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
  return {
    phase: "countdown",
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

/** On-screen rolls count. Drops anything that is not a plain non-negative integer. */
export function halloweenRollCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000) return null;
  return Math.round(value);
}
