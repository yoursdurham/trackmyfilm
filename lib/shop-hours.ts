/**
 * Retail hours already printed on the public tracking page and the
 * account sign-in email: Thursdays 5-7PM and Saturdays 11-2PM.
 * Times are America/New_York. The end minute is when the shop is closed.
 */
export const SHOP_TIME_ZONE = "America/New_York";
export const FRONT_WINDOW_SLUG = "front-window";

export const RETAIL_HOUR_LINES = [
  "Thursdays 5-7PM",
  "Saturdays 11-2PM",
] as const;

export const RETAIL_HOURS_LABEL = `Retail Hours: ${RETAIL_HOUR_LINES.join(" & ")}`;

/** Thursday 5:00 PM–7:00 PM, Saturday 11:00 AM–2:00 PM. */
const RETAIL_WINDOWS = [
  { weekday: 4, start: 17 * 60, end: 19 * 60 },
  { weekday: 6, start: 11 * 60, end: 14 * 60 },
] as const;

/**
 * Weekday of a calendar date. Some kiosk Chromium builds report "Thursday"
 * for weekday: "short", which used to throw and replace the display with
 * the cream error page. The civil weekday does not depend on that name.
 */
function weekdayOfCalendarDate(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function zonedParts(now: Date, options: Intl.DateTimeFormatOptions): Record<string, string> {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: SHOP_TIME_ZONE,
      ...options,
    }).formatToParts(now);
    const bag: Record<string, string> = {};
    for (const part of formatted) {
      if (part.type !== "literal") bag[part.type] = part.value;
    }
    return bag;
  } catch {
    return {};
  }
}

function shopClock(now: Date): { weekday: number; minutes: number } {
  const bag = zonedParts(now, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const year = Number(bag.year);
  const month = Number(bag.month);
  const day = Number(bag.day);
  if (!year || !month || !day) return { weekday: -1, minutes: 0 };
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  const minute = Number(bag.minute);
  return {
    weekday: weekdayOfCalendarDate(year, month, day),
    minutes: hour * 60 + (Number.isFinite(minute) ? minute : 0),
  };
}

/** True only during the published retail windows. */
export function isShopOpen(now: Date): boolean {
  const clock = shopClock(now);
  return RETAIL_WINDOWS.some((window) => (
    clock.weekday === window.weekday
    && clock.minutes >= window.start
    && clock.minutes < window.end
  ));
}

function zonedDateParts(date: Date): { year: number; month: number; day: number; weekday: number } {
  const bag = zonedParts(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const year = Number(bag.year);
  const month = Number(bag.month);
  const day = Number(bag.day);
  if (!year || !month || !day) {
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: date.getUTCDay() };
  }
  return { year, month, day, weekday: weekdayOfCalendarDate(year, month, day) };
}

/** UTC instant for a New York wall-clock minute on a calendar day. */
function shopInstant(year: number, month: number, day: number, minutes: number): Date {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: SHOP_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(utc));
    const bag: Record<string, string> = {};
    for (const part of formatted) {
      if (part.type !== "literal") bag[part.type] = part.value;
    }
    let seenHour = Number(bag.hour);
    if (seenHour === 24) seenHour = 0;
    const seen = Date.UTC(
      Number(bag.year),
      Number(bag.month) - 1,
      Number(bag.day),
      seenHour,
      Number(bag.minute),
      Number(bag.second),
    );
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    if (wanted === seen) break;
    utc += wanted - seen;
  }
  return new Date(utc);
}

function addCalendarDays(year: number, month: number, day: number, delta: number) {
  const shifted = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** Midnight at the end of the current America/New_York calendar day. */
export function endOfShopDay(now: Date): Date {
  const today = zonedDateParts(now);
  const next = addCalendarDays(today.year, today.month, today.day, 1);
  return shopInstant(next.year, next.month, next.day, 0);
}

/** The next time the shop opens or closes after `now`. */
export function nextRetailBoundary(now: Date): Date {
  const today = zonedDateParts(now);
  let best: number | null = null;
  for (let offset = 0; offset < 8; offset += 1) {
    const date = addCalendarDays(today.year, today.month, today.day, offset);
    const noon = shopInstant(date.year, date.month, date.day, 12 * 60);
    const weekday = zonedDateParts(noon).weekday;
    for (const window of RETAIL_WINDOWS) {
      if (window.weekday !== weekday) continue;
      for (const minutes of [window.start, window.end]) {
        const instant = shopInstant(date.year, date.month, date.day, minutes).getTime();
        if (instant > now.getTime() && (best === null || instant < best)) best = instant;
      }
    }
  }
  return new Date(best ?? now.getTime() + 60_000);
}

export const OPEN_SIGN_MODES = ["auto", "on", "off"] as const;
export type OpenSignMode = (typeof OPEN_SIGN_MODES)[number];

export function isOpenSignMode(value: unknown): value is OpenSignMode {
  return value === "auto" || value === "on" || value === "off";
}

/**
 * Front window only. `on` lasts until `openSignUntil` (or the end of the
 * current New York day when that instant is missing), then returns to auto.
 * A missing mode falls back to the older on/off switch: on means auto.
 */
export function resolveOpenSignMode(input: {
  slug?: string | null;
  openSignMode?: string | null;
  openSignUntil?: string | null;
  legacyEnabled?: boolean | null;
  now: Date;
}): OpenSignMode {
  if (input.slug !== FRONT_WINDOW_SLUG) return "off";
  const mode = isOpenSignMode(input.openSignMode)
    ? input.openSignMode
    : input.legacyEnabled === true
      ? "auto"
      : "off";
  if (mode !== "on") return mode;
  const parsed = input.openSignUntil ? new Date(input.openSignUntil) : endOfShopDay(input.now);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= input.now.getTime()) return "auto";
  return "on";
}

/** Instant when a forced-on sign returns to auto. A past or blank value means end of today. */
export function openSignForceUntil(until: string | null | undefined, now: Date): Date {
  const parsed = until ? new Date(until) : null;
  if (parsed && !Number.isNaN(parsed.getTime()) && parsed.getTime() > now.getTime()) return parsed;
  return endOfShopDay(now);
}

/**
 * Only the front window. Auto follows retail hours. On shows the sign
 * regardless of hours. Off hides it. A custom message still wins.
 * Every other slug ignores the control.
 */
export function shouldShowOpenSign(input: {
  slug: string;
  setting: OpenSignMode;
  mode: string;
  now: Date;
}): boolean {
  if (input.slug !== FRONT_WINDOW_SLUG) return false;
  if (input.mode === "custom_message") return false;
  if (input.setting === "on") return true;
  if (input.setting === "off") return false;
  return isShopOpen(input.now);
}
