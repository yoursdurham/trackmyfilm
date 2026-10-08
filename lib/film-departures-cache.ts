import { getInProcessDepartureOrders } from "@/lib/db";
import { computeFilmDepartures, type FilmDepartures } from "@/lib/film-departures";
import { FILM_METRICS_CONFIG } from "@/lib/film-metrics-config";

let cached: { value: FilmDepartures; expiresAt: number } | null = null;
let pending: Promise<FilmDepartures> | null = null;

export function clearFilmDeparturesCache(): void {
  cached = null;
  pending = null;
}

/**
 * One in-process snapshot. Concurrent polls share the in-flight read, and a
 * fresh snapshot is reused until cacheTtlMs passes. The query selects only
 * the columns the board needs.
 */
export async function getCachedFilmDepartures(now = new Date()): Promise<FilmDepartures> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (!pending) {
    const capturedNow = now;
    pending = getInProcessDepartureOrders()
      .then((orders) => {
        const value = computeFilmDepartures(orders, capturedNow);
        cached = { value, expiresAt: Date.now() + FILM_METRICS_CONFIG.cacheTtlMs };
        return value;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}
