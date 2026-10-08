import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FilmOrder } from "@/lib/types";

const mockGetOrders = vi.fn();

vi.mock("@/lib/db", () => ({
  getOrders: (...args: unknown[]) => mockGetOrders(...args),
}));

import { clearFilmMetricsCache, getCachedFilmMetrics } from "@/lib/film-metrics-cache";
import { FILM_METRICS_CONFIG } from "@/lib/film-metrics-config";

const order = {
  id: "order-1",
  order_number: "TMF001",
  customer_id: "customer-1",
  customer_name: "Secret Customer",
  customer_email: "secret@example.com",
  status: "Received by Yours",
  status_history: [],
  status_updated_at: "2026-10-08T15:00:00.000Z",
  film_type: "35mm",
  film_process: "Color",
  roll_count: 2,
  dropoff_date: "2026-10-08",
  dropoff_number: 1,
  received_by_yours_at: "2026-10-08T15:00:00.000Z",
} as FilmOrder;

describe("getCachedFilmMetrics", () => {
  beforeEach(() => {
    clearFilmMetricsCache();
    mockGetOrders.mockReset();
    mockGetOrders.mockResolvedValue([order]);
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearFilmMetricsCache();
  });

  it("reuses one database read until the cache window passes", async () => {
    const now = new Date("2026-10-08T19:00:00.000Z");
    const first = await getCachedFilmMetrics(now);
    const second = await getCachedFilmMetrics(now);

    expect(second).toEqual(first);
    expect(first.rollsProcessing).toBe(2);
    expect(mockGetOrders).toHaveBeenCalledTimes(1);

    vi.mocked(Date.now).mockReturnValue(1_000_000 + FILM_METRICS_CONFIG.cacheTtlMs + 1);
    await getCachedFilmMetrics(now);
    expect(mockGetOrders).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight read across overlapping polls", async () => {
    let release: (orders: FilmOrder[]) => void = () => {};
    mockGetOrders.mockReturnValue(new Promise((resolve) => {
      release = resolve;
    }));

    const pendingA = getCachedFilmMetrics(new Date("2026-10-08T19:00:00.000Z"));
    const pendingB = getCachedFilmMetrics(new Date("2026-10-08T19:00:00.000Z"));
    release([order]);
    const [a, b] = await Promise.all([pendingA, pendingB]);

    expect(a).toEqual(b);
    expect(mockGetOrders).toHaveBeenCalledTimes(1);
  });
});
