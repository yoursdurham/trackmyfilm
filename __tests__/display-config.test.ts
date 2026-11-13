import { describe, expect, it } from "vitest";
import { displayBuildId, type DisplayPayload } from "@/lib/display";
import {
  displayConfigContentKey,
  displayConfigFingerprint,
  reconcileDisplayConfig,
  toDisplayConfig,
  type DisplayConfig,
} from "@/lib/display-config";
import { DISPLAY_CONFIG_POLL_MS, FILM_STATS_REFRESH_MS } from "@/lib/display-schedule";
import { lastSaturdayOpening } from "@/lib/shop-hours";

const NOW = new Date("2026-10-08T19:00:00.000Z");
const MENU = {
  title: "YOUR'S FILM MENU",
  subtitle: "Durham",
  banner: [],
  sections: [{ title: "35MM FILM", items: [{ name: "Kodak Gold", price: "$12" }] }],
  notes: [],
};

function config(overrides: Partial<DisplayConfig> = {}): DisplayConfig {
  return {
    mode: "film_menu",
    theme: "yours-clean",
    isEnabled: true,
    overrideMode: null,
    overrideMessage: null,
    showStudioBookings: false,
    openSignMode: "off",
    openSignUntil: null,
    showOpenSign: false,
    studioInfoLines: ["Wi-Fi"],
    studioCheckoutLines: ["Lock the door"],
    refreshSeconds: 30,
    buildId: "dev",
    menuRevision: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function payload(overrides: Partial<DisplayPayload> = {}): DisplayPayload {
  return {
    mode: "film_menu",
    theme: "crt-green",
    refreshSeconds: 30,
    buildId: "dev",
    data: { menu: MENU },
    ...overrides,
  };
}

function reconcile(input: {
  slug?: string;
  config: DisplayConfig;
  current?: { payload: DisplayPayload; fetchedAt: number } | null;
  previousConfig?: DisplayConfig | null;
  modes?: Parameters<typeof reconcileDisplayConfig>[0]["modes"];
  openSignStats?: Parameters<typeof reconcileDisplayConfig>[0]["openSignStats"];
  now?: Date;
}) {
  return reconcileDisplayConfig({
    slug: input.slug ?? "studio-vertical",
    config: input.config,
    now: input.now ?? NOW,
    current: input.current === undefined ? null : input.current,
    previousConfig: input.previousConfig ?? null,
    modes: input.modes ?? {},
    openSignStats: input.openSignStats ?? null,
  });
}

describe("display config poll", () => {
  it("checks about every two minutes", () => {
    expect(DISPLAY_CONFIG_POLL_MS).toBe(120_000);
  });

  it("keeps the Open sign off the studio screen", () => {
    const row = toDisplayConfig({
      slug: "studio-vertical",
      mode: "film_stats",
      theme: "yours-clean",
      is_enabled: true,
      override_mode: null,
      override_payload: null,
      show_open_sign: true,
      open_sign_mode: "on",
      open_sign_until: "2026-10-09T04:00:00.000Z",
    }, displayBuildId());
    expect(row.openSignMode).toBe("off");
    expect(row.showOpenSign).toBe(false);
    expect(row.openSignUntil).toBeNull();
  });

  it("keeps the front-window On mode and its end time", () => {
    const row = toDisplayConfig({
      slug: "front-window",
      mode: "idle",
      theme: "yours-dark",
      is_enabled: true,
      override_mode: null,
      override_payload: null,
      show_open_sign: true,
      open_sign_mode: "on",
      open_sign_until: "2026-10-09T04:00:00.000Z",
    }, "build-1");
    expect(row.openSignMode).toBe("on");
    expect(row.openSignUntil).toBe("2026-10-09T04:00:00.000Z");
    expect(row.theme).toBe("yours-dark");
    expect(row.buildId).toBe("build-1");
  });
});

describe("reconcileDisplayConfig", () => {
  const freshMenuAt = lastSaturdayOpening(NOW).getTime();

  it("refetches the film menu when the price list timestamp changes", () => {
    const row = config();
    const decision = reconcile({
      config: config({ menuRevision: "2026-10-08T18:00:00.000Z" }),
      previousConfig: row,
      current: { payload: payload(), fetchedAt: freshMenuAt },
    });
    expect(decision).toMatchObject({ payload: null, fetchContent: true, bypassCache: true });
  });

  it("leaves film stats in place when only the price list timestamp changes", () => {
    const showing = payload({ mode: "film_stats", theme: "yours-clean", data: { rollsProcessing: 4 } });
    const decision = reconcile({
      config: config({ mode: "film_stats", menuRevision: "2026-10-08T18:00:00.000Z" }),
      previousConfig: config({ mode: "film_stats" }),
      current: { payload: showing, fetchedAt: NOW.getTime() },
    });
    expect(decision.fetchContent).toBe(false);
    expect(decision.payload).toBeNull();
  });

  it("does not refetch a fresh film menu when the row is unchanged", () => {
    const row = config();
    const decision = reconcile({
      config: row,
      previousConfig: row,
      current: { payload: payload(), fetchedAt: freshMenuAt },
    });
    expect(decision).toMatchObject({ payload: null, fetchContent: false, reschedule: false });
  });

  it("does not refetch just because the shop clock moved", () => {
    const row = config({ openSignMode: "auto", showOpenSign: true });
    const showing = payload({
      openSign: "auto",
      showOpenSign: true,
      openSignStats: {
        rollsProcessing: 4,
        receivedToday: 1,
        receivedThisWeek: 2,
        scansSentToday: 1,
        scansSentThisWeek: 2,
        averageColorTurnaroundDays: 4,
        averageBwTurnaroundDays: null,
        nextLabRun: "Friday 12:00 PM",
      },
    });
    const during = new Date("2026-10-08T21:30:00.000Z");
    const statsAt = during.getTime() - 20 * 60 * 1000;
    const beforeOpen = reconcile({
      slug: "front-window",
      config: row,
      previousConfig: row,
      current: { payload: showing, fetchedAt: statsAt },
      now: NOW,
    });
    const duringOpen = reconcile({
      slug: "front-window",
      config: row,
      previousConfig: row,
      current: { payload: showing, fetchedAt: statsAt },
      now: during,
    });
    expect(beforeOpen.fetchContent).toBe(false);
    expect(duringOpen.fetchContent).toBe(false);
    expect(duringOpen.payload).toBeNull();
  });

  it("paints a theme change without a content fetch", () => {
    const previous = config();
    const next = config({ theme: "yours-dark" });
    const decision = reconcile({
      config: next,
      previousConfig: previous,
      current: { payload: payload(), fetchedAt: freshMenuAt },
    });
    expect(decision.fetchContent).toBe(false);
    expect(decision.reschedule).toBe(false);
    expect(decision.payload?.theme).toBe("yours-dark");
    expect(decision.payload?.mode).toBe("film_menu");
    expect(decision.payload?.data).toEqual({ menu: MENU });
  });

  it("switches to a cached film stats payload and skips the fetch", () => {
    const previous = config();
    const next = config({ mode: "film_stats" });
    const fetchedAt = NOW.getTime() - 30 * 60 * 1000;
    const decision = reconcile({
      config: next,
      previousConfig: previous,
      current: { payload: payload(), fetchedAt: freshMenuAt },
      modes: {
        film_stats: {
          fetchedAt,
          data: { rollsProcessing: 8, nextLabRun: "Friday 12:00 PM" },
        },
      },
    });
    expect(decision.fetchContent).toBe(false);
    expect(decision.reschedule).toBe(true);
    expect(decision.fetchedAt).toBe(fetchedAt);
    expect(decision.payload?.mode).toBe("film_stats");
    expect(decision.payload?.data.rollsProcessing).toBe(8);
  });

  it("fetches film stats when the saved copy is older than two hours", () => {
    const decision = reconcile({
      config: config({ mode: "film_stats" }),
      previousConfig: config(),
      current: { payload: payload(), fetchedAt: freshMenuAt },
      modes: {
        film_stats: {
          fetchedAt: NOW.getTime() - FILM_STATS_REFRESH_MS,
          data: { rollsProcessing: 8 },
        },
      },
    });
    expect(decision).toMatchObject({ payload: null, fetchContent: true, bypassCache: true });
  });

  it("fetches a mode that has no saved copy", () => {
    const decision = reconcile({
      config: config({ mode: "film_departures" }),
      previousConfig: config(),
      current: { payload: payload(), fetchedAt: freshMenuAt },
    });
    expect(decision).toMatchObject({ payload: null, fetchContent: true, bypassCache: true });
  });

  it("shows a custom message immediately", () => {
    const decision = reconcile({
      config: config({ overrideMode: "custom_message", overrideMessage: "Back soon" }),
      previousConfig: config(),
      current: { payload: payload(), fetchedAt: freshMenuAt },
    });
    expect(decision.fetchContent).toBe(false);
    expect(decision.payload?.mode).toBe("custom_message");
    expect(decision.payload?.data).toEqual({ message: "Back soon" });
  });

  it("returns a forced-on sign to auto after open_sign_until without a content fetch", () => {
    const until = "2026-10-08T18:00:00.000Z";
    const previous = config({
      mode: "idle",
      openSignMode: "on",
      openSignUntil: until,
      showOpenSign: true,
    });
    const showing = payload({
      mode: "idle",
      theme: "crt-green",
      data: {},
      openSign: "on",
      openSignUntil: until,
      showOpenSign: true,
    });
    const decision = reconcile({
      slug: "front-window",
      config: previous,
      previousConfig: previous,
      current: { payload: showing, fetchedAt: NOW.getTime() },
      openSignStats: {
        fetchedAt: NOW.getTime() - 10 * 60 * 1000,
        stats: {
          rollsProcessing: 3,
          receivedToday: 1,
          receivedThisWeek: 4,
          scansSentToday: 0,
          scansSentThisWeek: 2,
          averageColorTurnaroundDays: null,
          averageBwTurnaroundDays: null,
          nextLabRun: "Friday 12:00 PM",
        },
      },
    });
    expect(decision.fetchContent).toBe(false);
    expect(decision.payload?.openSign).toBe("auto");
    expect(decision.payload?.openSignUntil).toBeUndefined();
    expect(decision.payload?.showOpenSign).toBe(true);
  });

  it("asks for fresh Open-sign numbers when they are older than the film-stats schedule", () => {
    const row = config({ mode: "film_menu", openSignMode: "auto", showOpenSign: true });
    const decision = reconcile({
      slug: "front-window",
      config: row,
      previousConfig: row,
      current: {
        payload: payload({ openSign: "auto", showOpenSign: true }),
        fetchedAt: freshMenuAt,
      },
      openSignStats: {
        fetchedAt: NOW.getTime() - FILM_STATS_REFRESH_MS,
        stats: {
          rollsProcessing: 3,
          receivedToday: null,
          receivedThisWeek: null,
          scansSentToday: null,
          scansSentThisWeek: null,
          averageColorTurnaroundDays: null,
          averageBwTurnaroundDays: null,
          nextLabRun: null,
        },
      },
    });
    expect(decision.fetchContent).toBe(true);
    expect(decision.payload).toBeNull();
  });

  it("does not put the Open sign on any screen but the front window", () => {
    const row = config({
      theme: "yours-dark",
      openSignMode: "on",
      showOpenSign: true,
      openSignUntil: "2026-10-09T04:00:00.000Z",
    });
    const decision = reconcile({
      slug: "studio-vertical",
      config: row,
      previousConfig: config(),
      current: { payload: payload(), fetchedAt: freshMenuAt },
    });
    expect(decision.payload?.mode).toBe("film_menu");
    expect(decision.payload?.theme).toBe("yours-dark");
    expect(decision.payload?.openSign).toBeUndefined();
    expect(decision.payload?.showOpenSign).toBeUndefined();
    expect(displayConfigContentKey(row)).toBe(displayConfigContentKey(config({
      openSignMode: "on",
      showOpenSign: true,
      openSignUntil: "2026-10-09T04:00:00.000Z",
    })));
    expect(displayConfigFingerprint(row)).not.toBe(displayConfigFingerprint(config()));
  });

  it("trusts a payload that was just fetched when no previous config was saved", () => {
    const row = config({ mode: "film_stats" });
    const decision = reconcile({
      config: row,
      current: {
        payload: payload({ mode: "film_stats", theme: "yours-clean", data: { rollsProcessing: 2 } }),
        fetchedAt: NOW.getTime(),
      },
    });
    expect(decision.fetchContent).toBe(false);
    expect(decision.payload).toBeNull();
  });

  it("fetches when studio bookings can cover a changed default", () => {
    const decision = reconcile({
      config: config({ mode: "idle", showStudioBookings: true }),
      previousConfig: config({ mode: "film_menu", showStudioBookings: true }),
      current: { payload: payload(), fetchedAt: freshMenuAt },
    });
    expect(decision).toMatchObject({ payload: null, fetchContent: true, bypassCache: true });
  });
});
