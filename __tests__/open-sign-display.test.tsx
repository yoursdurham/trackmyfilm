import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DisplayPlayer from "../components/display/DisplayPlayer";
import OpenSignScreen from "../components/display/OpenSignScreen";
import { isSelectableDefaultMode, publicPayloadForDisplay } from "../lib/display";
import { isShopOpen, nextRetailBoundary, RETAIL_HOURS_LABEL, shouldShowOpenSign } from "../lib/shop-hours";
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
  it("covers the selected mode during open hours, and a custom message still wins", () => {
    expect(shouldShowOpenSign({ enabled: true, mode: "film_stats", now: THURSDAY_OPEN })).toBe(true);
    expect(shouldShowOpenSign({ enabled: true, mode: "studio_welcome", now: THURSDAY_OPEN })).toBe(true);
    expect(shouldShowOpenSign({ enabled: true, mode: "custom_message", now: THURSDAY_OPEN })).toBe(false);
    expect(shouldShowOpenSign({ enabled: true, mode: "film_stats", now: WEDNESDAY })).toBe(false);
    expect(shouldShowOpenSign({ enabled: false, mode: "film_stats", now: THURSDAY_OPEN })).toBe(false);
  });

  it("is not a selectable mode, and the flag rides on the payload", () => {
    expect(isSelectableDefaultMode("open_sign")).toBe(false);
    const on = publicPayloadForDisplay({
      mode: "film_stats",
      theme: "yours-dark",
      is_enabled: true,
      override_mode: null,
      override_payload: null,
      show_open_sign: true,
    });
    expect(on.mode).toBe("film_stats");
    expect(on.showOpenSign).toBe(true);

    const off = publicPayloadForDisplay({
      mode: "idle",
      theme: "yours-clean",
      is_enabled: true,
      override_mode: null,
      override_payload: null,
      show_open_sign: false,
    });
    expect(off).not.toHaveProperty("showOpenSign");
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
};

describe("open sign rendering", () => {
  it("is only the lit OPEN word, with the published hours", () => {
    const html = renderToStaticMarkup(<OpenSignScreen orientation="landscape" />);
    expect(html).toContain(">OPEN<");
    expect(html).not.toContain("CLOSED");
    expect(html).toContain("Thursdays 5-7PM");
    expect(html).toContain("Saturdays 11-2PM");
    expect(html).toContain("open-sign-word");
    expect(html).not.toContain("is-closed");
  });

  it("keeps the studio dead zone when the sign is not covering the mode", () => {
    const html = renderToStaticMarkup(
      <DisplayPlayer slug="studio-vertical" orientation="portrait" initial={idle} loadedBuildId="dev" preview />,
    );
    expect(html).toContain("data-display-safe-inset=\"222\"");
    expect(html).toContain("data-display-deadzone");
  });

  it("leaves the front window full bleed", () => {
    const html = renderToStaticMarkup(
      <DisplayPlayer slug="front-window" orientation="landscape" initial={{ ...idle, showOpenSign: false }} loadedBuildId="dev" preview />,
    );
    expect(html).toContain("data-display-safe-inset=\"0\"");
    expect(html).not.toContain("data-display-deadzone");
  });
});
