/**
 * Retail hours already printed on the public tracking page and the
 * account sign-in email: Thursdays 5-7PM and Saturdays 11-2PM.
 * Times are America/New_York. The end minute is when the shop is closed.
 */
export const SHOP_TIME_ZONE = "America/New_York";

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
