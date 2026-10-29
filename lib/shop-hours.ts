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

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Thursday 5:00 PM–7:00 PM, Saturday 11:00 AM–2:00 PM. */
const RETAIL_WINDOWS = [
  { weekday: 4, start: 17 * 60, end: 19 * 60 },
  { weekday: 6, start: 11 * 60, end: 14 * 60 },
] as const;

function shopClock(now: Date): { weekday: number; minutes: number } {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const bag: Record<string, string> = {};
  for (const part of formatted) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  const weekday = WEEKDAY_INDEX[bag.weekday];
  if (weekday === undefined) {
    throw new Error(`Unrecognized weekday "${bag.weekday}"`);
  }
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return { weekday, minutes: hour * 60 + Number(bag.minute) };
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
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const bag: Record<string, string> = {};
  for (const part of formatted) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  const weekday = WEEKDAY_INDEX[bag.weekday];
  if (weekday === undefined) throw new Error(`Unrecognized weekday "${bag.weekday}"`);
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    weekday,
  };
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

/**
 * Only the front window. During retail hours the sign covers the selected
 * mode and any studio booking. A custom message still wins. Every other
 * slug ignores the switch.
 */
export function shouldShowOpenSign(input: {
  slug: string;
  enabled: boolean;
  mode: string;
  now: Date;
}): boolean {
  if (input.slug !== FRONT_WINDOW_SLUG) return false;
  if (!input.enabled) return false;
  if (input.mode === "custom_message") return false;
  return isShopOpen(input.now);
}
