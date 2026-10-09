import { displayNow } from "@/lib/display-clock";
import { getCachedFilmDepartures } from "@/lib/film-departures-cache";
import { getCachedFilmMenu } from "@/lib/film-menu-cache";
import { getCachedFilmMetrics } from "@/lib/film-metrics-cache";
import {
  clampRefreshSeconds,
  publicPayloadForDisplay,
  type DisplayPayload,
  type DisplayResolveInput,
  type StudioDisplayInput,
} from "@/lib/display";
import type { FilmDepartures } from "@/lib/film-departures";
import type { FilmMenu } from "@/lib/film-menu";
import { shopClock, type FilmMetrics } from "@/lib/film-metrics";
import type { StudioBooking } from "@/lib/studio-calendar";
import { getCachedStudioAgenda } from "@/lib/studio-calendar-cache";

/** Shop is quiet from 10:00 PM through 6:59 AM America/New_York. */
export const CLOSED_SHOP_REFRESH_SECONDS = 300;
const BOOKING_LEAD_MS = 60 * 60 * 1000;

function shopIsClosed(now: Date): boolean {
  const hour = shopClock(now).hour;
  return hour >= 22 || hour < 7;
}

function bookingKeepsFastPoll(bookings: readonly Pick<StudioBooking, "start" | "end">[], now: Date): boolean {
  const t = now.getTime();
  return bookings.some((booking) => {
    const start = booking.start.getTime();
    const end = booking.end.getTime();
    if (start <= t && t < end) return true;
    return start > t && start - t <= BOOKING_LEAD_MS;
  });
}

/**
 * Daytime polls keep the screen's saved interval. Overnight, polls slow to
 * five minutes unless a studio booking is in progress or starts within an hour.
 * `bookings` null means the calendar was not loaded; overnight still slows down.
 */
export function refreshSecondsForShop(
  stored: number | null | undefined,
  now: Date,
  bookings: readonly Pick<StudioBooking, "start" | "end">[] | null,
): number {
  const base = clampRefreshSeconds(stored);
  if (!shopIsClosed(now)) return base;
  if (bookings && bookingKeepsFastPoll(bookings, now)) return base;
  return clampRefreshSeconds(CLOSED_SHOP_REFRESH_SECONDS);
}

const FILM_MODES = new Set(["film_stats", "film_status"]);

function winningMode(display: DisplayResolveInput["display"]): string {
  if (display.is_enabled === false) return "";
  const override = display.override_mode?.trim() ?? "";
  if (override) return override;
  return (display.mode ?? "").trim();
}

export function displayNeedsFilmMetrics(display: DisplayResolveInput["display"]): boolean {
  return FILM_MODES.has(winningMode(display));
}

export function displayNeedsFilmMenu(display: DisplayResolveInput["display"]): boolean {
  return winningMode(display) === "film_menu";
}

export function displayNeedsFilmDepartures(display: DisplayResolveInput["display"]): boolean {
  return winningMode(display) === "film_departures";
}

/** Bookings can cover the default mode. A manual override already wins, so skip the fetch. */
export function displayShowsStudioBookings(display: DisplayResolveInput["display"]): boolean {
  if (display.is_enabled === false) return false;
  if (display.show_studio_bookings === false) return false;
  if (display.override_mode?.trim()) return false;
  return true;
}

/** Public display payload. Film data and studio bookings are loaded only when they can show. */
export async function publicPayloadWithFilm(
  display: DisplayResolveInput["display"],
): Promise<DisplayPayload> {
  const now = displayNow();
  const needsMetrics = displayNeedsFilmMetrics(display);
  const needsMenu = displayNeedsFilmMenu(display);
  const needsDepartures = displayNeedsFilmDepartures(display);
  const needsStudio = displayShowsStudioBookings(display);

  let film: FilmMetrics | null = null;
  let menu: FilmMenu | null = null;
  let departures: FilmDepartures | null = null;
  let studio: StudioDisplayInput | null = null;
  let bookings: StudioBooking[] | null = null;
  if (needsMetrics) {
    try {
      film = await getCachedFilmMetrics();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[film-metrics]", message);
    }
  }
  if (needsMenu) {
    try {
      menu = await getCachedFilmMenu();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[film-menu]", message);
    }
  }
  if (needsDepartures) {
    try {
      departures = await getCachedFilmDepartures();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[film-departures]", message);
    }
  }
  if (needsStudio) {
    try {
      const agenda = await getCachedStudioAgenda(now);
      studio = agenda.input;
      bookings = agenda.bookings;
    } catch {
      console.error("[studio-calendar] unavailable");
    }
  }
  const payload = publicPayloadForDisplay(display, {
    now,
    ...(film ? { film } : {}),
    ...(menu ? { menu } : {}),
    ...(departures ? { departures } : {}),
    ...(studio ? { studio } : {}),
  });
  return {
    ...payload,
    refreshSeconds: refreshSecondsForShop(payload.refreshSeconds, now, needsStudio ? bookings : null),
  };
}
