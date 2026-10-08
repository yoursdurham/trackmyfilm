import { getCachedFilmDepartures } from "@/lib/film-departures-cache";
import { getCachedFilmMenu } from "@/lib/film-menu-cache";
import { getCachedFilmMetrics } from "@/lib/film-metrics-cache";
import {
  publicPayloadForDisplay,
  type DisplayPayload,
  type DisplayResolveInput,
  type StudioDisplayInput,
} from "@/lib/display";
import type { FilmDepartures } from "@/lib/film-departures";
import type { FilmMenu } from "@/lib/film-menu";
import type { FilmMetrics } from "@/lib/film-metrics";
import { getCachedStudioAgenda } from "@/lib/studio-calendar-cache";

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
  const needsMetrics = displayNeedsFilmMetrics(display);
  const needsMenu = displayNeedsFilmMenu(display);
  const needsDepartures = displayNeedsFilmDepartures(display);
  const needsStudio = displayShowsStudioBookings(display);

  let film: FilmMetrics | null = null;
  let menu: FilmMenu | null = null;
  let departures: FilmDepartures | null = null;
  let studio: StudioDisplayInput | null = null;
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
      studio = (await getCachedStudioAgenda(new Date())).input;
    } catch {
      console.error("[studio-calendar] unavailable");
    }
  }
  if (!needsMetrics && !needsMenu && !needsDepartures && !needsStudio) return publicPayloadForDisplay(display);
  return publicPayloadForDisplay(display, {
    ...(film ? { film } : {}),
    ...(menu ? { menu } : {}),
    ...(departures ? { departures } : {}),
    ...(studio ? { studio } : {}),
  });
}
