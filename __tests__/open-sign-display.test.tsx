import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DisplayPlayer from "../components/display/DisplayPlayer";
import OpenSignScreen from "../components/display/OpenSignScreen";
import { isSelectableDefaultMode, publicPayloadForDisplay } from "../lib/display";
import { displayNeedsOpenSignStats } from "../lib/display-screen";
import { FRONT_WINDOW_SLUG, isShopOpen, nextRetailBoundary, RETAIL_HOURS_LABEL, shouldShowOpenSign } from "../lib/shop-hours";
import type { DisplayPayload } from "../lib/display";

const migration = readFileSync("supabase/migrations/028_display_open_sign.sql", "utf8");

const THURSDAY_OPEN = new Date("2026-10-29T22:00:00.000Z");
const THURSDAY_START = new Date("2026-10-29T21:00:00.000Z");
const THURSDAY_END = new Date("2026-10-29T23:00:00.000Z");
const BEFORE_OPEN = new Date("2026-10-29T20:59:00.000Z");
const SATURDAY_OPEN = new Date("2026-10-31T15:30:00.000Z");
const SATURDAY_START = new Date("2026-10-31T15:00:00.000Z");
const SATURDAY_END = new Date("2026-10-31T18:00:00.000Z");
const WEDNESDAY = new Date("2026-10-28T16:00:00.000Z");

describe("shop retail hours", () => {
  it("uses the hours already published on the site", () => {
    expect(RETAIL_HOURS_LABEL).toBe("Retail Hours: Thursdays 5-7PM & Saturdays 11-2PM");
  });

  it("is open only during Thursday 5-7PM and Saturday 11-2PM New York", () => {
    expect(isShopOpen(THURSDAY_OPEN)).toBe(true);
    expect(isShopOpen(THURSDAY_START)).toBe(true);
    expect(isShopOpen(THURSDAY_END)).toBe(false);
    expect(isShopOpen(BEFORE_OPEN)).toBe(false);
    expect(isShopOpen(SATURDAY_OPEN)).toBe(true);
    expect(isShopOpen(SATURDAY_START)).toBe(true);
    expect(isShopOpen(SATURDAY_END)).toBe(false);
    expect(isShopOpen(WEDNESDAY)).toBe(false);
  });

  it("names the next open or close instant", () => {
    expect(nextRetailBoundary(BEFORE_OPEN).toISOString()).toBe(THURSDAY_START.toISOString());
    expect(nextRetailBoundary(THURSDAY_OPEN).toISOString()).toBe(THURSDAY_END.toISOString());
    expect(nextRetailBoundary(THURSDAY_END).toISOString()).toBe(SATURDAY_START.toISOString());
  });
});

describe("open sign schedule", () => {
  it("covers the front window during open hours, and a custom message still wins", () => {
    const front = { slug: FRONT_WINDOW_SLUG, enabled: true, now: THURSDAY_OPEN };
    expect(shouldShowOpenSign({ ...front, mode: "film_stats" })).toBe(true);
    expect(shouldShowOpenSign({ ...front, mode: "studio_welcome" })).toBe(true);
    expect(shouldShowOpenSign({ ...front, mode: "custom_message" })).toBe(false);
    expect(shouldShowOpenSign({ ...front, mode: "film_stats", now: WEDNESDAY })).toBe(false);
    expect(shouldShowOpenSign({ ...front, enabled: false, mode: "film_stats" })).toBe(false);
  });

  it("ignores the switch on every other screen, including studio-vertical", () => {
    expect(shouldShowOpenSign({
      slug: "studio-vertical",
      enabled: true,
      mode: "idle",
      now: THURSDAY_OPEN,
    })).toBe(false);
    expect(shouldShowOpenSign({
      slug: "studio-vertical",
      enabled: true,
      mode: "film_stats",
      now: SATURDAY_OPEN,
    })).toBe(false);
  });

  it("is not a selectable mode, and only the front window carries the flag", () => {
    expect(isSelectableDefaultMode("open_sign")).toBe(false);
    const on = publicPayloadForDisplay({
      slug: FRONT_WINDOW_SLUG,
      mode: "film_stats",
      theme: "yours-dark",
      is_enabled: true,
      override_mode: null,
      override_payload: null,
      show_open_sign: true,
    }, {
      film: {
        rollsProcessing: 12,
        receivedToday: 3,
        receivedThisWeek: 9,
        scansSentToday: 2,
        scansSentThisWeek: 7,
        averageColorTurnaroundDays: 4.5,
        averageBwTurnaroundDays: null,
        nextLabRun: "Friday 12:00 PM",
        customer_email: "guest@example.com",
        customer_name: "Ada Lovelace",
      },
    });
    expect(on.mode).toBe("film_stats");
    expect(on.showOpenSign).toBe(true);
    expect(on.openSignStats).toEqual({
      rollsProcessing: 12,
      receivedToday: 3,
      receivedThisWeek: 9,
      scansSentToday: 2,
      scansSentThisWeek: 7,
      averageColorTurnaroundDays: 4.5,
      averageBwTurnaroundDays: null,
      nextLabRun: "Friday 12:00 PM",
    });
    expect(JSON.stringify(on)).not.toMatch(/guest@|Ada Lovelace/);

    const studio = publicPayloadForDisplay({
      slug: "studio-vertical",
      mode: "idle",
      theme: "crt-green",
      is_enabled: true,
      override_mode: null,
      override_payload: null,
      show_open_sign: true,
    });
    expect(studio.mode).toBe("idle");
    expect(studio).not.toHaveProperty("showOpenSign");
    expect(studio).not.toHaveProperty("openSignStats");

    const off = publicPayloadForDisplay({
      slug: FRONT_WINDOW_SLUG,
      mode: "idle",
      theme: "yours-clean",
      is_enabled: true,
      override_mode: null,
      override_payload: null,
      show_open_sign: false,
    });
    expect(off).not.toHaveProperty("showOpenSign");
    expect(off).not.toHaveProperty("openSignStats");
  });

  it("loads film stats for the front window only while the sign can show", () => {
    const front = {
      slug: FRONT_WINDOW_SLUG,
      mode: "idle",
      theme: "yours-dark",
      is_enabled: true,
      show_open_sign: true,
      override_mode: null,
      override_payload: null,
    };
    expect(displayNeedsOpenSignStats(front)).toBe(true);
    expect(displayNeedsOpenSignStats({ ...front, override_mode: "custom_message" })).toBe(false);
    expect(displayNeedsOpenSignStats({ ...front, show_open_sign: false })).toBe(false);
    expect(displayNeedsOpenSignStats({ ...front, slug: "studio-vertical" })).toBe(false);
  });

  it("puts the staff switch only on the front window card", () => {
    const page = readFileSync("app/displays/page.tsx", "utf8");
    const start = page.indexOf(`display.slug === FRONT_WINDOW_SLUG`);
    const end = page.indexOf(": null}", start);
    const block = page.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("Show Open sign during open hours");
    expect(page.replace(block, "")).not.toContain("Show Open sign during open hours");
  });

  it("turns the front window on once and leaves later edits alone", () => {
    expect(migration).toMatch(/add column if not exists show_open_sign boolean/i);
    expect(migration).toMatch(/slug = 'front-window'/);
    expect(migration).toMatch(/show_open_sign is null/);
    expect(migration).toMatch(/set default false/i);
    expect(migration).not.toMatch(/show_open_sign = true\s+where slug <> 'front-window'/);
  });
});

const idle: DisplayPayload = {
  mode: "idle",
  theme: "yours-clean",
  refreshSeconds: 30,
  buildId: "dev",
  data: {},
  showOpenSign: true,
  openSignStats: {
    rollsProcessing: 12,
    receivedToday: 3,
    receivedThisWeek: 9,
    scansSentToday: 2,
    scansSentThisWeek: 7,
    averageColorTurnaroundDays: 4.5,
    averageBwTurnaroundDays: null,
    nextLabRun: "Friday 12:00 PM",
  },
};

describe("open sign rendering", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("puts hours beside OPEN and the film-stats strip along the bottom", () => {
    const html = renderToStaticMarkup(
      <OpenSignScreen
        stats={{
          rollsProcessing: 12,
          receivedToday: 3,
          receivedThisWeek: 9,
          scansSentToday: 2,
          scansSentThisWeek: 7,
          averageColorTurnaroundDays: 4.5,
          averageBwTurnaroundDays: null,
          nextLabRun: "Friday 12:00 PM",
        }}
      />,
    );
    expect(html).toContain(">OPEN<");
    expect(html).not.toContain("CLOSED");
    expect(html).toContain("data-open-sign-hours");
    expect(html).toContain("Thursdays 5-7PM");
    expect(html).toContain("Saturdays 11-2PM");
    expect(html).toContain("data-open-sign-stats");
    expect(html).toContain("data-stat=\"rolls-processing\"");
    expect(html).toContain("data-stat=\"turnaround\"");
    expect(html).toContain(">12<");
    expect(html).toContain(">4.5<");
    expect(html).toContain("Friday 12:00 PM");
    expect(html).toContain("Last 30 days");
    expect(html).not.toContain("is-closed");
    expect(html.indexOf("data-open-sign-word")).toBeLessThan(html.indexOf("data-open-sign-hours"));
    expect(html.indexOf("data-open-sign-hours")).toBeLessThan(html.indexOf("data-open-sign-stats"));
  });

  it("covers the front window during open hours and never the studio screen", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(THURSDAY_OPEN);

    const front = renderToStaticMarkup(
      <DisplayPlayer slug="front-window" orientation="landscape" initial={idle} loadedBuildId="dev" preview />,
    );
    expect(front).toContain("data-display-mode=\"open_sign\"");
    expect(front).toContain(">OPEN<");
    expect(front).toContain("data-open-sign-stats");
    expect(front).toContain("data-stat=\"scans-sent\"");
    expect(front).toContain("data-display-safe-inset=\"0\"");
    expect(front).not.toContain("data-display-deadzone");

    const studio = renderToStaticMarkup(
      <DisplayPlayer slug="studio-vertical" orientation="portrait" initial={idle} loadedBuildId="dev" preview />,
    );
    expect(studio).not.toContain("data-display-mode=\"open_sign\"");
    expect(studio).not.toContain("data-open-sign-stats");
    expect(studio).not.toContain(">OPEN<");
    expect(studio).toContain("data-display-safe-inset=\"222\"");
    expect(studio).toContain("data-display-deadzone");

    const message = renderToStaticMarkup(
      <DisplayPlayer
        slug="front-window"
        orientation="landscape"
        initial={{ ...idle, mode: "custom_message", data: { message: "Back in a few minutes" } }}
        loadedBuildId="dev"
        preview
      />,
    );
    expect(message).not.toContain("data-display-mode=\"open_sign\"");
    expect(message).toContain("Back in a few minutes");
  });

  it("leaves the front window on its selected mode outside retail hours", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WEDNESDAY);
    const html = renderToStaticMarkup(
      <DisplayPlayer slug="front-window" orientation="landscape" initial={idle} loadedBuildId="dev" preview />,
    );
    expect(html).not.toContain("data-display-mode=\"open_sign\"");
    expect(html).toContain("data-display-safe-inset=\"0\"");
    expect(html).not.toContain("data-display-deadzone");
  });
});
