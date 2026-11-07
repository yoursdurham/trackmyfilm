import { describe, expect, it } from "vitest";
import { clampRefreshSeconds } from "@/lib/display";
import {
  DISPLAY_REFRESH_QUERY,
  displayContentFresh,
  displayRefreshPolicy,
  FILM_STATS_REFRESH_MS,
  planDisplaySync,
} from "@/lib/display-schedule";
import { lastSaturdayOpening, nextSaturdayOpening } from "@/lib/shop-hours";

const WEEK = 7 * 24 * 60 * 60 * 1000;

function plan(input: {
  mode: string | null;
  fetchedAt?: number | null;
  now: Date;
  force?: boolean;
  preview?: boolean;
}) {
  return planDisplaySync({
    mode: input.mode,
    fetchedAt: input.fetchedAt ?? null,
    now: input.now,
    force: input.force ?? false,
    preview: input.preview ?? false,
    pollMs: clampRefreshSeconds(30) * 1000,
  });
}

describe("Saturday shop-open instants", () => {
  it("uses 11:00 America/New_York across daylight saving time", () => {
    const beforeSpring = new Date("2026-03-14T14:59:00.000Z");
    expect(lastSaturdayOpening(beforeSpring).toISOString()).toBe("2026-03-07T16:00:00.000Z");
    expect(nextSaturdayOpening(beforeSpring).toISOString()).toBe("2026-03-14T15:00:00.000Z");

    const springOpen = new Date("2026-03-14T15:00:00.000Z");
    expect(lastSaturdayOpening(springOpen).toISOString()).toBe("2026-03-14T15:00:00.000Z");
    expect(nextSaturdayOpening(springOpen).getTime() - springOpen.getTime()).toBe(WEEK);

    const beforeFall = new Date("2026-11-07T15:59:00.000Z");
    expect(lastSaturdayOpening(beforeFall).toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(nextSaturdayOpening(beforeFall).toISOString()).toBe("2026-11-07T16:00:00.000Z");

    const fallOpen = new Date("2026-11-07T16:00:00.000Z");
    expect(lastSaturdayOpening(fallOpen).toISOString()).toBe("2026-11-07T16:00:00.000Z");
  });
});

describe("display refresh policy", () => {
  it("slows only the film menu and film stats", () => {
    expect(displayRefreshPolicy("film_menu")).toBe("weekly");
    expect(displayRefreshPolicy("film_stats")).toBe("two-hour");
    for (const mode of ["idle", "film_status", "film_departures", "custom_message", "studio_active", "studio_welcome", "studio_upcoming", "studio_ending_soon"]) {
      expect(displayRefreshPolicy(mode)).toBe("poll");
    }
  });

  it("treats a film menu as fresh until the next Saturday opening", () => {
    const wednesday = new Date("2026-10-07T15:00:00.000Z");
    const fetched = lastSaturdayOpening(wednesday).getTime();
    expect(displayContentFresh({ mode: "film_menu", fetchedAt: fetched, now: wednesday })).toBe(true);
    const saturday = nextSaturdayOpening(wednesday);
    expect(displayContentFresh({ mode: "film_menu", fetchedAt: fetched, now: saturday })).toBe(false);
    expect(displayContentFresh({ mode: "film_menu", fetchedAt: saturday.getTime(), now: saturday })).toBe(true);
  });

  it("treats film stats as fresh for two hours", () => {
    const now = new Date("2026-10-08T19:00:00.000Z");
    const fetchedAt = now.getTime() - FILM_STATS_REFRESH_MS + 1;
    expect(displayContentFresh({ mode: "film_stats", fetchedAt, now })).toBe(true);
    expect(displayContentFresh({
      mode: "film_stats",
      fetchedAt: now.getTime() - FILM_STATS_REFRESH_MS,
      now,
    })).toBe(false);
  });
});

describe("planDisplaySync", () => {
  const now = new Date("2026-10-08T19:00:00.000Z");

  it("fetches once when a screen has no saved copy", () => {
    expect(plan({ mode: null, now })).toMatchObject({
      action: "fetch",
      heartbeat: true,
      checkReload: true,
      bypassCache: false,
    });
  });

  it("waits on a fresh film menu without a heartbeat or a reload", () => {
    const decision = plan({ mode: "film_menu", fetchedAt: lastSaturdayOpening(now).getTime(), now });
    expect(decision).toMatchObject({
      action: "wait",
      heartbeat: false,
      checkReload: false,
      bypassCache: false,
    });
    expect(decision.waitMs).toBe(nextSaturdayOpening(now).getTime() - now.getTime());
  });

  it("fetches a stale film menu and bypasses the saved server copy", () => {
    expect(plan({
      mode: "film_menu",
      fetchedAt: lastSaturdayOpening(now).getTime() - WEEK,
      now,
    })).toMatchObject({
      action: "fetch",
      heartbeat: true,
      checkReload: true,
      bypassCache: true,
    });
  });

  it("waits inside two hours of film stats and fetches after that", () => {
    expect(plan({ mode: "film_stats", fetchedAt: now.getTime() - 60 * 60 * 1000, now }).action).toBe("wait");
    expect(plan({ mode: "film_stats", fetchedAt: now.getTime() - FILM_STATS_REFRESH_MS, now })).toMatchObject({
      action: "fetch",
      bypassCache: true,
      heartbeat: true,
    });
  });

  it("keeps live modes on the poll, including after a slow screen changes mode", () => {
    for (const mode of ["idle", "custom_message", "studio_active", "studio_welcome", "film_departures"]) {
      expect(plan({ mode, fetchedAt: now.getTime(), now })).toMatchObject({
        action: "poll",
        pollMs: 30_000,
        heartbeat: true,
        checkReload: true,
        bypassCache: false,
      });
    }
  });

  it("forces one fetch from the refresh query even when the copy is fresh", () => {
    expect(DISPLAY_REFRESH_QUERY).toBe("refresh");
    expect(plan({
      mode: "film_menu",
      fetchedAt: now.getTime(),
      now,
      force: true,
    })).toMatchObject({
      action: "fetch",
      bypassCache: true,
      heartbeat: true,
      checkReload: true,
    });
  });

  it("lets staff preview a fresh film menu without a heartbeat", () => {
    expect(plan({
      mode: "film_menu",
      fetchedAt: now.getTime(),
      now,
      preview: true,
    })).toMatchObject({
      action: "wait",
      heartbeat: false,
      checkReload: false,
    });
    expect(plan({ mode: null, now, preview: true })).toMatchObject({
      action: "fetch",
      heartbeat: false,
      checkReload: true,
    });
  });
});
