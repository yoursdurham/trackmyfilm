import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DepartureOrder } from "@/lib/film-departures";

const mockGetInProcessDepartureOrders = vi.fn();

vi.mock("@/lib/db", () => ({
  getInProcessDepartureOrders: (...args: unknown[]) => mockGetInProcessDepartureOrders(...args),
}));

import { clearFilmDeparturesCache, getCachedFilmDepartures } from "@/lib/film-departures-cache";
import { FILM_METRICS_CONFIG } from "@/lib/film-metrics-config";

const order: DepartureOrder = {
  id: "order-1",
  customer_id: "customer-1",
  customer_name: "Secret Customer",
  status: "Received by Yours",
  roll_count: 2,
  received_by_yours_at: "2026-10-08T15:00:00.000Z",
};

describe("getCachedFilmDepartures", () => {
  beforeEach(() => {
    clearFilmDeparturesCache();
    mockGetInProcessDepartureOrders.mockReset();
    mockGetInProcessDepartureOrders.mockResolvedValue([order]);
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearFilmDeparturesCache();
  });

  it("reuses one database read until the cache window passes", async () => {
    const now = new Date("2026-10-08T19:00:00.000Z");
    const first = await getCachedFilmDepartures(now);
    const second = await getCachedFilmDepartures(now);

    expect(second).toEqual(first);
    expect(first.rows[0]?.name).toBe("SECRET C.");
    expect(first.studioRolls).toBe(2);
    expect(mockGetInProcessDepartureOrders).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(first)).not.toMatch(/Secret Customer/);

    vi.mocked(Date.now).mockReturnValue(1_000_000 + FILM_METRICS_CONFIG.cacheTtlMs + 1);
    await getCachedFilmDepartures(now);
    expect(mockGetInProcessDepartureOrders).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight read across overlapping polls", async () => {
    let release: (orders: DepartureOrder[]) => void = () => {};
    mockGetInProcessDepartureOrders.mockReturnValue(new Promise((resolve) => {
      release = resolve;
    }));

    const pendingA = getCachedFilmDepartures(new Date("2026-10-08T19:00:00.000Z"));
    const pendingB = getCachedFilmDepartures(new Date("2026-10-08T19:00:00.000Z"));
    release([order]);
    const [a, b] = await Promise.all([pendingA, pendingB]);

    expect(a).toEqual(b);
    expect(mockGetInProcessDepartureOrders).toHaveBeenCalledTimes(1);
  });
});
