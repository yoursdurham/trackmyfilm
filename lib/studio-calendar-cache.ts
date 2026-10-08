/**
 * Server-only calendar fetch. The iCal address is read from
 * STUDIO_CALENDAR_ICS_URL and is never returned, logged, or sent to a screen.
 * A failed fetch keeps the last good parse so a blip does not blank the kiosk.
 * With no successful parse yet, callers get no bookings and the screen stays
 * on its default mode.
 */

import { bookingsFromIcs, classifyStudioBookings, summarizeStudioBookings, type StudioBooking } from "@/lib/studio-calendar";
import { STUDIO_CALENDAR_CACHE_MS, type StudioCalendarStatus } from "@/lib/studio-calendar-config";
import type { StudioDisplayInput } from "@/lib/display";

const FETCH_TIMEOUT_MS = 8_000;

export interface StudioAgenda {
  bookings: StudioBooking[];
  input: StudioDisplayInput | null;
  status: StudioCalendarStatus;
}

interface Snapshot {
  expiresAt: number;
  configured: boolean;
  connected: boolean;
  bookings: StudioBooking[];
}

let snapshot: Snapshot | null = null;
let pending: Promise<Snapshot> | null = null;

export function clearStudioCalendarCache(): void {
  snapshot = null;
  pending = null;
}

function emptySnapshot(configured: boolean, connected: boolean, bookings: StudioBooking[] = []): Snapshot {
  return {
    expiresAt: Date.now() + STUDIO_CALENDAR_CACHE_MS,
    configured,
    connected,
    bookings,
  };
}

async function readCalendar(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "text/calendar, text/plain;q=0.9,*/*;q=0.1" },
  });
  if (!response.ok) throw new Error("calendar response was not ok");
  return response.text();
}

async function loadSnapshot(now: Date): Promise<Snapshot> {
  const url = process.env.STUDIO_CALENDAR_ICS_URL?.trim() ?? "";
  if (!url) return emptySnapshot(false, false);
  const previous = snapshot?.configured ? snapshot.bookings : [];
  try {
    const ics = await readCalendar(url);
    return emptySnapshot(true, true, bookingsFromIcs(ics, now));
  } catch {
    console.error("[studio-calendar] fetch failed");
    return emptySnapshot(true, false, previous);
  }
}

async function currentSnapshot(now: Date): Promise<Snapshot> {
  if (snapshot && snapshot.expiresAt > Date.now()) return snapshot;
  if (!pending) {
    pending = loadSnapshot(now)
      .then((next) => {
        snapshot = next;
        return next;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export async function getCachedStudioAgenda(now = new Date()): Promise<StudioAgenda> {
  const current = await currentSnapshot(now);
  const summary = current.configured
    ? summarizeStudioBookings(current.bookings, now)
    : { bookingsLeftToday: null, nextBookingStart: null };
  return {
    bookings: current.bookings,
    input: current.bookings.length ? classifyStudioBookings(current.bookings, now) : null,
    status: {
      configured: current.configured,
      connected: current.connected,
      bookingsLeftToday: summary.bookingsLeftToday,
      nextBookingStart: summary.nextBookingStart,
    },
  };
}
