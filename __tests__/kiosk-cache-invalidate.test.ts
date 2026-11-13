import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidate, state } = vi.hoisted(() => ({
  revalidate: vi.fn(),
  state: {
    result: { data: null as unknown, error: null as { message: string } | null },
  },
}));

vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => revalidate(...args),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

function builder() {
  const self = {
    select() { return self; },
    update() { return self; },
    upsert() { return self; },
    eq() { return self; },
    maybeSingle: async () => state.result,
    single: async () => state.result,
  };
  return self;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => builder(),
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

import { getFilmMenuUpdatedAt, saveFilmMenu, updateDisplay } from "@/lib/db";
import { DISPLAY_ROW_CACHE_TAG, FILM_MENU_CACHE_TAG } from "@/lib/display-cache-tags";

describe("kiosk cache invalidation", () => {
  beforeEach(() => {
    revalidate.mockClear();
    state.result = { data: { slug: "front-window", content: { title: "Menu" } }, error: null };
  });

  it("drops the display-row cache after a screen save", async () => {
    const updated = await updateDisplay("front-window", { mode: "idle" });
    expect(updated).toMatchObject({ slug: "front-window" });
    expect(revalidate).toHaveBeenCalledWith(DISPLAY_ROW_CACHE_TAG, { expire: 0 });
    expect(revalidate).not.toHaveBeenCalledWith(FILM_MENU_CACHE_TAG, { expire: 0 });
  });

  it("does not drop the cache when the screen is missing", async () => {
    state.result = { data: null, error: null };
    await expect(updateDisplay("missing", { mode: "idle" })).resolves.toBeNull();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("drops the menu timestamp cache after a price save", async () => {
    state.result = { data: { content: { title: "Menu", sections: [], notes: [] } }, error: null };
    await saveFilmMenu({ title: "Menu", subtitle: "", banner: [], sections: [], notes: [] });
    expect(revalidate).toHaveBeenCalledWith(FILM_MENU_CACHE_TAG, { expire: 0 });
  });

  it("reads only the film menu timestamp", async () => {
    state.result = { data: { updated_at: "2026-11-01T15:00:00.000Z" }, error: null };
    await expect(getFilmMenuUpdatedAt()).resolves.toBe("2026-11-01T15:00:00.000Z");
    expect(revalidate).not.toHaveBeenCalled();
  });
});
