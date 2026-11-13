import { beforeEach, describe, expect, it, vi } from "vitest";

const { cacheOptions, revalidateCalls, mockGetDisplay, mockMenuRevision } = vi.hoisted(() => ({
  cacheOptions: [] as { keys: string[]; revalidate?: number | false; tags?: string[] }[],
  revalidateCalls: [] as unknown[][],
  mockGetDisplay: vi.fn(),
  mockMenuRevision: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown, keys: string[], opts: { revalidate?: number | false; tags?: string[] }) => {
    cacheOptions.push({ keys, revalidate: opts.revalidate, tags: opts.tags });
    return (...args: unknown[]) => fn(...args);
  },
  revalidateTag: (...args: unknown[]) => {
    revalidateCalls.push(args);
  },
}));

vi.mock("@/lib/db", () => ({
  getDisplayBySlug: (...args: unknown[]) => mockGetDisplay(...args),
  getFilmMenuUpdatedAt: () => mockMenuRevision(),
}));

import { DISPLAY_ROW_CACHE_TAG, FILM_MENU_CACHE_TAG } from "@/lib/display-cache-tags";
import { KIOSK_DATA_CACHE_SECONDS, getCachedDisplayBySlug, getCachedFilmMenuRevision, readKioskDisplay } from "@/lib/display-row-cache";
import { invalidateKioskDisplayRow, invalidateKioskFilmMenu } from "@/lib/kiosk-cache-invalidate";

describe("kiosk display cache", () => {
  beforeEach(() => {
    mockGetDisplay.mockReset();
    mockMenuRevision.mockReset();
    revalidateCalls.length = 0;
  });

  it("keeps the display row and the menu timestamp for a day, behind tags a save can drop", () => {
    expect(KIOSK_DATA_CACHE_SECONDS).toBe(24 * 60 * 60);
    expect(cacheOptions).toEqual([
      { keys: ["kiosk-display-row"], revalidate: KIOSK_DATA_CACHE_SECONDS, tags: [DISPLAY_ROW_CACHE_TAG] },
      { keys: ["kiosk-film-menu-revision"], revalidate: KIOSK_DATA_CACHE_SECONDS, tags: [FILM_MENU_CACHE_TAG] },
    ]);
  });

  it("reads Supabase on a forced refresh and uses the cached reader otherwise", async () => {
    mockGetDisplay.mockResolvedValue({ slug: "front-window" });
    await readKioskDisplay("front-window", true);
    await getCachedDisplayBySlug("front-window");
    expect(mockGetDisplay).toHaveBeenNthCalledWith(1, "front-window");
    expect(mockGetDisplay).toHaveBeenNthCalledWith(2, "front-window");
  });

  it("expires the row and the menu timestamp immediately", () => {
    invalidateKioskDisplayRow();
    invalidateKioskFilmMenu();
    expect(revalidateCalls).toEqual([
      [DISPLAY_ROW_CACHE_TAG, { expire: 0 }],
      [FILM_MENU_CACHE_TAG, { expire: 0 }],
    ]);
  });

  it("returns the cached menu timestamp", async () => {
    mockMenuRevision.mockResolvedValue("2026-11-01T15:00:00.000Z");
    await expect(getCachedFilmMenuRevision()).resolves.toBe("2026-11-01T15:00:00.000Z");
  });
});
