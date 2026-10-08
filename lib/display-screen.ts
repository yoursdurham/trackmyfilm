import { getCachedFilmMenu } from "@/lib/film-menu-cache";
import { getCachedFilmMetrics } from "@/lib/film-metrics-cache";
import {
  publicPayloadForDisplay,
  type DisplayPayload,
  type DisplayResolveInput,
} from "@/lib/display";
import type { FilmMenu } from "@/lib/film-menu";
import type { FilmMetrics } from "@/lib/film-metrics";

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

/** Public display payload. Film metrics and the menu are loaded only when that mode can win. */
export async function publicPayloadWithFilm(
  display: DisplayResolveInput["display"],
): Promise<DisplayPayload> {
  const needsMetrics = displayNeedsFilmMetrics(display);
  const needsMenu = displayNeedsFilmMenu(display);
  if (!needsMetrics && !needsMenu) return publicPayloadForDisplay(display);

  let film: FilmMetrics | null = null;
  let menu: FilmMenu | null = null;
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
  return publicPayloadForDisplay(display, {
    ...(film ? { film } : {}),
    ...(menu ? { menu } : {}),
  });
}
