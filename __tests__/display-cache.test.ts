import { describe, expect, it } from "vitest";
import { readDisplayCache, writeDisplayCache, type CachedDisplay } from "@/lib/display-cache";
import type { DisplayPayload } from "@/lib/display";

function memoryStorage(seed: Record<string, string> = {}) {
  const values = { ...seed };
  return {
    values,
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem(key: string, value: string) {
      values[key] = value;
    },
  };
}

const payload: DisplayPayload = {
  mode: "film_menu",
  theme: "crt-green",
  refreshSeconds: 30,
  buildId: "dev",
  data: { menu: { title: "YOUR'S FILM MENU", subtitle: "", banner: [], sections: [], notes: [] } },
};

describe("display cache", () => {
  it("round-trips the payload that should survive a reboot", () => {
    const storage = memoryStorage();
    const entry: CachedDisplay = { fetchedAt: Date.parse("2026-10-10T15:00:00.000Z"), payload };
    writeDisplayCache(storage, "front-window", entry);
    expect(readDisplayCache(storage, "front-window")).toEqual(entry);
    expect(readDisplayCache(storage, "studio-vertical")).toBeNull();
  });

  it("ignores a corrupt or incomplete copy", () => {
    const storage = memoryStorage({
      "tmf-display-cache:v1:front-window": "{",
      "tmf-display-cache:v1:studio-vertical": JSON.stringify({ fetchedAt: "yesterday", payload }),
    });
    expect(readDisplayCache(storage, "front-window")).toBeNull();
    expect(readDisplayCache(storage, "studio-vertical")).toBeNull();
  });

  it("ignores a payload that is not a screen payload", () => {
    const storage = memoryStorage({
      "tmf-display-cache:v1:front-window": JSON.stringify({
        fetchedAt: 10,
        payload: { mode: "film_menu", email: "guest@example.com" },
      }),
    });
    expect(readDisplayCache(storage, "front-window")).toBeNull();
  });
});
