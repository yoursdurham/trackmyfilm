import { getFilmMetricsOrders } from "@/lib/db";
import { computeFilmMetrics, type FilmMetrics } from "@/lib/film-metrics";
import { FILM_METRICS_CONFIG } from "@/lib/film-metrics-config";

let cached: { value: FilmMetrics; expiresAt: number } | null = null;
let pending: Promise<FilmMetrics> | null = null;

export function clearFilmMetricsCache(): void {
  cached = null;
  pending = null;
}

/**
 * One shop-wide snapshot. Concurrent polls share the in-flight read, and a
 * fresh snapshot is reused until cacheTtlMs passes.
 */
export async function getCachedFilmMetrics(now = new Date()): Promise<FilmMetrics> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (!pending) {
    const capturedNow = now;
    pending = getFilmMetricsOrders(capturedNow)
      .then((orders) => {
        const value = computeFilmMetrics(orders, capturedNow);
        cached = { value, expiresAt: Date.now() + FILM_METRICS_CONFIG.cacheTtlMs };
        return value;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}
