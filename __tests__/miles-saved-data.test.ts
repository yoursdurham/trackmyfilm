import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCount, cacheOptions } = vi.hoisted(() => ({
  mockCount: vi.fn(),
  cacheOptions: [] as { keys: string[]; revalidate?: number }[],
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>, keys: string[], opts: { revalidate?: number }) => {
    cacheOptions.push({ keys, revalidate: opts.revalidate });
    return fn;
  },
}));

vi.mock("@/lib/db", () => ({
  countFilmOrdersCreatedInRange: (...args: unknown[]) => mockCount(...args),
  countAllFilmOrders: (...args: unknown[]) => mockCount(...args),
}));

import { getCachedAllTimeMilesSaved, getCachedPublicMilesSaved, loadAllTimeMilesSaved, loadPublicMilesSaved } from "@/lib/miles-saved-data";

const NOW = new Date("2026-10-21T18:41:00.000Z");

describe("public miles saved loader", () => {
  beforeEach(() => {
    mockCount.mockReset();
    mockCount.mockResolvedValue(681);
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("caches the count for an hour and returns miles, laps, and year only", async () => {
    const result = await loadPublicMilesSaved(NOW);

    expect(cacheOptions).toEqual([
      { keys: ["public-miles-saved"], revalidate: 3600 },
      { keys: ["all-time-miles-saved"], revalidate: 3600 },
    ]);
    expect(mockCount).toHaveBeenCalledTimes(1);
    expect(mockCount).toHaveBeenCalledWith(
      "2026-01-01T05:00:00.000Z",
      "2027-01-01T05:00:00.000Z",
    );
    expect(result).toEqual({ miles: 34464, laps: 34464 / 24901, year: 2026 });
    expect(result).not.toHaveProperty("ordersCreated");
    expect(result).not.toHaveProperty("trips");
  });

  it("uses a non-production preview count and ignores it in production", async () => {
    vi.stubEnv("MILES_SAVED_PREVIEW_ORDERS", "681");
    mockCount.mockResolvedValue(0);
    const preview = await loadPublicMilesSaved(NOW);
    expect(preview.miles).toBe(34464);
    expect(mockCount).not.toHaveBeenCalled();

    vi.stubEnv("NODE_ENV", "production");
    mockCount.mockResolvedValue(681);
    const production = await loadPublicMilesSaved(NOW);
    expect(production.miles).toBe(34464);
    expect(mockCount).toHaveBeenCalledTimes(1);
  });

  it("counts every order for all-time miles and still adds the 2026 sheet", async () => {
    const result = await loadAllTimeMilesSaved(NOW);
    expect(mockCount).toHaveBeenCalledTimes(1);
    expect(mockCount).toHaveBeenCalledWith();
    expect(result.miles).toBe(34464);
    expect(result).not.toHaveProperty("ordersCreated");
    expect(result).not.toHaveProperty("year");
  });

  it("reads through the hourly cache wrapper", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const cached = await getCachedPublicMilesSaved();
    expect(cached.miles).toBe(34464);
    expect(cached.year).toBe(2026);
  });
});
