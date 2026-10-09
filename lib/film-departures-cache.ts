import { getDepartureBoardOrders } from "@/lib/db";
import { computeFilmDepartures, type FilmDepartures, type TurnaroundAverages } from "@/lib/film-departures";
import { FILM_METRICS_CONFIG } from "@/lib/film-metrics-config";
import { getCachedFilmMetrics } from "@/lib/film-metrics-cache";

let cached: { value: FilmDepartures; expiresAt: number } | null = null;
let pending: Promise<FilmDepartures> | null = null;

export function clearFilmDeparturesCache(): void {
  cached = null;
  pending = null;
}

async function turnaroundAverages(now: Date): Promise<TurnaroundAverages> {
  try {
    const metrics = await getCachedFilmMetrics(now);
    return {
      colorDays: metrics.averageColorTurnaroundDays,
      bwDays: metrics.averageBwTurnaroundDays,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[film-departures] turnaround unavailable", message);
    return { colorDays: null, bwDays: null };
  }
}

/**
 * One board snapshot. Concurrent polls share the in-flight read, and a
 * fresh snapshot is reused until cacheTtlMs passes. Expected dates use the
 * film-stats turnaround averages. If those are unavailable the board still
 * renders and the expected column is blank.
 */
export async function getCachedFilmDepartures(now = new Date()): Promise<FilmDepartures> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (!pending) {
    const capturedNow = now;
    pending = Promise.all([
      getDepartureBoardOrders(capturedNow),
      turnaroundAverages(capturedNow),
    ])
      .then(([orders, averages]) => {
        const value = computeFilmDepartures(orders, capturedNow, averages);
        cached = { value, expiresAt: Date.now() + FILM_METRICS_CONFIG.cacheTtlMs };
        return value;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}
