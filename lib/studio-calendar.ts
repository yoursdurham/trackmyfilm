/**
 * Pure ICS parsing for studio bookings. This module does not read the network
 * or the calendar URL. The only fields it returns are first name, session type,
 * and start/end times.
 */

import ical, { type CalendarComponent, type ParameterValue, type VEvent } from "node-ical";
import {
  ACUITY_BOOKING_TITLE,
  STUDIO_TIME_ZONE,
  STUDIO_WINDOWS,
  type StudioCalendarStatus,
} from "@/lib/studio-calendar-config";
import type { StudioDisplayInput, StudioSessionView } from "@/lib/display";

export interface StudioBooking {
  firstName: string;
  sessionType: string;
  start: Date;
  end: Date;
}

const MINUTE_MS = 60_000;

function textValue(value: ParameterValue | undefined): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.val === "string") return value.val;
  return "";
}

function nyParts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour === "24" ? "0" : bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

function offsetMs(instant: Date): number {
  const parts = nyParts(instant);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - instant.getTime();
}

/** Wall-clock time in America/New_York as an absolute instant. */
export function nyWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let result = guess - offsetMs(new Date(guess));
  result = guess - offsetMs(new Date(result));
  return new Date(result);
}

export function startOfNyDay(date: Date): Date {
  const parts = nyParts(date);
  return nyWallTimeToUtc(parts.year, parts.month, parts.day);
}

export function endOfNyDay(date: Date): Date {
  const parts = nyParts(date);
  return nyWallTimeToUtc(parts.year, parts.month, parts.day + 1);
}

function addNyDays(date: Date, days: number): Date {
  const parts = nyParts(date);
  return nyWallTimeToUtc(parts.year, parts.month, parts.day + days, parts.hour, parts.minute, parts.second);
}

function nyDateKey(date: Date): string {
  const parts = nyParts(date);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

export function formatStudioTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatNextStart(date: Date, now: Date): string {
  const time = formatStudioTime(date);
  const day = nyDateKey(date);
  if (day === nyDateKey(now)) return time;
  if (day === nyDateKey(addNyDays(now, 1))) return `Tomorrow ${time}`;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TIME_ZONE,
    weekday: "long",
  }).format(date);
  return `${weekday} ${time}`;
}

/**
 * Floating datetimes (no Z, no TZID) are the studio clock. Google usually sends
 * TZID, but a bare value must not follow the server's UTC clock.
 */
export function anchorFloatingTimes(ics: string): string {
  const unfolded = ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  return unfolded.replace(
    /^(DTSTART|DTEND|EXDATE|RECURRENCE-ID|RDATE)([^:\n]*):(.*)$/gm,
    (full, prop: string, params: string, value: string) => {
      if (/TZID=/i.test(params)) return full;
      if (/VALUE=DATE/i.test(params) && !/T/.test(value)) return full;
      const hasFloating = value.split(",").some((part) => /^\d{8}T\d{6}$/.test(part.trim()));
      if (!hasFloating) return full;
      return `${prop}${params};TZID=${STUDIO_TIME_ZONE}:${value}`;
    },
  );
}

function isVEvent(value: CalendarComponent | { type?: string } | undefined): value is VEvent {
  return !!value && value.type === "VEVENT";
}

function utcCalendarDate(date: Date): { year: number; month: number; day: number } {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function instanceRange(start: Date & { dateOnly?: boolean }, end: Date | undefined, allDay: boolean) {
  if (allDay || start.dateOnly) {
    const from = utcCalendarDate(start);
    const to = end ? utcCalendarDate(end) : { year: from.year, month: from.month, day: from.day + 1 };
    return {
      start: nyWallTimeToUtc(from.year, from.month, from.day),
      end: nyWallTimeToUtc(to.year, to.month, to.day),
    };
  }
  const startAt = new Date(start.getTime());
  const endAt = end ? new Date(end.getTime()) : new Date(startAt.getTime() + 60 * MINUTE_MS);
  if (endAt.getTime() <= startAt.getTime()) {
    return { start: startAt, end: new Date(startAt.getTime() + 60 * MINUTE_MS) };
  }
  return { start: startAt, end: endAt };
}

function firstNameOf(fullName: string): string {
  const token = fullName.replace(/\s+/g, " ").trim().split(" ")[0] ?? "";
  return token.slice(0, 80);
}

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().toLowerCase();
}

function dedupe(bookings: StudioBooking[], titles: string[]): StudioBooking[] {
  const kept = new Map<string, { booking: StudioBooking; index: number }>();
  bookings.forEach((booking, index) => {
    const key = `${booking.start.getTime()}|${normalizeTitle(titles[index] ?? "")}`;
    const existing = kept.get(key);
    if (!existing || booking.end.getTime() > existing.booking.end.getTime()) {
      kept.set(key, { booking, index });
    }
  });
  return [...kept.values()]
    .sort((a, b) => a.booking.start.getTime() - b.booking.start.getTime() || a.index - b.index)
    .map((entry) => entry.booking);
}

/**
 * Acuity bookings inside today and tomorrow, studio time. Recurring instances,
 * exclusions, all-day dates, and cancellations are resolved before the title
 * filter. Descriptions are never copied onto the result.
 */
export function bookingsFromIcs(ics: string, now: Date): StudioBooking[] {
  const parsed = ical.parseICS(anchorFloatingTimes(ics));
  const from = new Date(startOfNyDay(now).getTime() - 12 * 60 * MINUTE_MS);
  const to = endOfNyDay(addNyDays(now, 1));
  const bookings: StudioBooking[] = [];
  const titles: string[] = [];

  for (const component of Object.values(parsed)) {
    if (!isVEvent(component)) continue;
    let instances;
    try {
      instances = ical.expandRecurringEvent(component, {
        from,
        to,
        includeOverrides: true,
        excludeExdates: true,
        expandOngoing: true,
      });
    } catch {
      continue;
    }
    for (const instance of instances) {
      if (instance.event?.status === "CANCELLED") continue;
      const title = textValue(instance.summary).replace(/\s+/g, " ").trim();
      const match = ACUITY_BOOKING_TITLE.exec(title);
      if (!match?.[1] || !match[2]) continue;
      const firstName = firstNameOf(match[1]);
      const sessionType = match[2].replace(/\s+/g, " ").trim().slice(0, 80);
      if (!firstName || !sessionType || !instance.start) continue;
      const range = instanceRange(instance.start, instance.end, instance.isFullDay);
      bookings.push({
        firstName,
        sessionType,
        start: range.start,
        end: range.end,
      });
      titles.push(title);
    }
  }

  return dedupe(bookings, titles);
}

function toView(booking: StudioBooking): StudioSessionView {
  return {
    firstName: booking.firstName,
    sessionType: booking.sessionType,
    start: formatStudioTime(booking.start),
    end: formatStudioTime(booking.end),
  };
}

/**
 * Picks at most one in-progress session and one upcoming session.
 * An in-progress session wins in the resolver; the upcoming one is only
 * there for the moment the current session ends.
 */
export function classifyStudioBookings(
  bookings: readonly StudioBooking[],
  now: Date,
): StudioDisplayInput | null {
  const t = now.getTime();
  const upcomingMs = STUDIO_WINDOWS.upcomingMinutes * MINUTE_MS;
  const welcomeMs = STUDIO_WINDOWS.welcomeMinutes * MINUTE_MS;
  const endingMs = STUDIO_WINDOWS.endingSoonMinutes * MINUTE_MS;

  const current = bookings
    .filter((booking) => booking.start.getTime() <= t && t < booking.end.getTime())
    .sort((a, b) => b.start.getTime() - a.start.getTime())[0];

  const next = bookings
    .filter((booking) => booking.start.getTime() > t && t >= booking.start.getTime() - upcomingMs)
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];

  const input: StudioDisplayInput = {};
  if (current) {
    const view = toView(current);
    if (t >= current.end.getTime() - endingMs) input.endingSoon = view;
    else input.active = view;
  }
  if (next) {
    const view = toView(next);
    if (t >= next.start.getTime() - welcomeMs) input.welcome = view;
    else input.upcoming = view;
  }

  if (!input.active && !input.endingSoon && !input.welcome && !input.upcoming) return null;
  return input;
}

export function summarizeStudioBookings(
  bookings: readonly StudioBooking[],
  now: Date,
): Pick<StudioCalendarStatus, "bookingsLeftToday" | "nextBookingStart"> {
  const todayStart = startOfNyDay(now).getTime();
  const todayEnd = endOfNyDay(now).getTime();
  const bookingsLeftToday = bookings.filter((booking) => (
    booking.end.getTime() > now.getTime()
    && booking.start.getTime() < todayEnd
    && booking.end.getTime() > todayStart
  )).length;
  const next = bookings
    .filter((booking) => booking.start.getTime() > now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  return {
    bookingsLeftToday,
    nextBookingStart: next ? formatNextStart(next.start, now) : null,
  };
}
