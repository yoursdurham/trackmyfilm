import { getCachedFilmMetrics } from "@/lib/film-metrics-cache";
import {
  publicPayloadForDisplay,
  type DisplayPayload,
  type DisplayResolveInput,
} from "@/lib/display";

const FILM_MODES = new Set(["film_stats", "film_status"]);

export function displayNeedsFilmMetrics(display: DisplayResolveInput["display"]): boolean {
  if (display.is_enabled === false) return false;
  const override = display.override_mode?.trim() ?? "";
  if (override) return FILM_MODES.has(override);
  return FILM_MODES.has((display.mode ?? "").trim());
}

/** Public display payload, with film metrics attached only when that mode can win. */
export async function publicPayloadWithFilm(
  display: DisplayResolveInput["display"],
): Promise<DisplayPayload> {
  if (!displayNeedsFilmMetrics(display)) return publicPayloadForDisplay(display);
  try {
    const film = await getCachedFilmMetrics();
    return publicPayloadForDisplay(display, { film });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[film-metrics]", message);
    return publicPayloadForDisplay(display);
  }
}
