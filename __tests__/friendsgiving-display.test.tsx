import { existsSync, statSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DisplayPlayer from "../components/display/DisplayPlayer";
import {
  DISPLAY_PRIORITY,
  displayNeedsReload,
  isKnownDisplayMode,
  isSelectableDefaultMode,
  publicPayloadForDisplay,
  resolveDisplayState,
  selectableDefaultModes,
  type DisplayPayload,
} from "../lib/display";
import { reconcileDisplayConfig, type DisplayConfig } from "../lib/display-config";
import { displayNeedsOpenSignStats, displayShowsStudioBookings } from "../lib/display-screen";
import {
  FRIENDSGIVING_MODE,
  FRIENDSGIVING_VIDEO_SRC,
  friendsgivingPlaybackAction,
} from "../lib/friendsgiving-display";
import { FRONT_WINDOW_SLUG, shouldShowOpenSign } from "../lib/shop-hours";

const THURSDAY_OPEN = new Date("2026-10-29T22:00:00.000Z");
const WEDNESDAY = new Date("2026-10-28T16:00:00.000Z");
const PARTY = new Date("2026-11-21T00:00:00.000Z");

const front = {
  slug: FRONT_WINDOW_SLUG,
  mode: FRIENDSGIVING_MODE,
  theme: "yours-dark",
  is_enabled: true,
  override_mode: "custom_message" as string | null,
  override_payload: { message: "Back in ten minutes" } as { message: string } | null,
  show_open_sign: true,
  open_sign_mode: "auto",
  open_sign_until: null as string | null,
  show_studio_bookings: true,
};

function config(overrides: Partial<DisplayConfig> = {}): DisplayConfig {
  return {
    mode: FRIENDSGIVING_MODE,
    theme: "yours-dark",
    isEnabled: true,
    overrideMode: "custom_message",
    overrideMessage: "Back in ten minutes",
    showStudioBookings: true,
    openSignMode: "on",
    openSignUntil: "2026-11-22T05:00:00.000Z",
    showOpenSign: true,
    studioInfoLines: ["Wi-Fi"],
    studioCheckoutLines: ["Lock the door"],
    refreshSeconds: 30,
    buildId: "dev",
    menuRevision: "",
    ...overrides,
  };
}

describe("Friendsgiving mode", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the loop video in public and offers the mode only on the front window", () => {
    const file = "public/display/friendsgiving-front-window.mp4";
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeGreaterThan(1_000_000);
    expect(FRIENDSGIVING_VIDEO_SRC).toBe("/display/friendsgiving-front-window.mp4");

    expect(selectableDefaultModes(FRONT_WINDOW_SLUG).map((option) => option.value)).toContain(FRIENDSGIVING_MODE);
    expect(selectableDefaultModes("studio-vertical").map((option) => option.value)).not.toContain(FRIENDSGIVING_MODE);
    expect(selectableDefaultModes("studio-vertical", "film_stats").map((option) => option.label)).toContain("Film stats");
    expect(isSelectableDefaultMode(FRIENDSGIVING_MODE, FRONT_WINDOW_SLUG)).toBe(true);
    expect(isSelectableDefaultMode(FRIENDSGIVING_MODE, "studio-vertical")).toBe(false);
    expect(isSelectableDefaultMode(FRIENDSGIVING_MODE)).toBe(false);
    expect(isSelectableDefaultMode("film_stats", "studio-vertical")).toBe(true);
    expect(isKnownDisplayMode(FRIENDSGIVING_MODE)).toBe(true);
    expect(displayNeedsReload({
      loadedBuildId: "abc",
      payloadBuildId: "abc",
      mode: FRIENDSGIVING_MODE,
      now: 10_000,
      lastReloadAt: null,
    })).toBe(false);
  });

  it("beats a custom message, a booking, a playlist, and the Open sign", () => {
    const resolved = resolveDisplayState({
      display: front,
      now: THURSDAY_OPEN,
      studio: {
        active: { firstName: "Avery", sessionType: "1 Hour Session", start: "6:00 PM", end: "7:00 PM" },
      },
      playlist: { items: [{ mode: "film_stats", enabled: true }] },
      film: { rollsProcessing: 4, customer_email: "guest@example.com" },
    });
    expect(resolved).toMatchObject({
      mode: FRIENDSGIVING_MODE,
      priority: DISPLAY_PRIORITY.friendsgiving,
      data: {},
    });
    expect(resolved.priority).toBeGreaterThan(DISPLAY_PRIORITY.override);
    expect(resolved).not.toHaveProperty("showOpenSign");
    expect(resolved).not.toHaveProperty("openSign");
    expect(JSON.stringify(resolved)).not.toMatch(/guest@|Avery|Back in ten/);

    const payload = publicPayloadForDisplay(front, { now: THURSDAY_OPEN });
    expect(payload.mode).toBe(FRIENDSGIVING_MODE);
    expect(payload).not.toHaveProperty("showOpenSign");
    expect(payload).not.toHaveProperty("openSignStats");

    expect(shouldShowOpenSign({
      slug: FRONT_WINDOW_SLUG,
      setting: "auto",
      mode: FRIENDSGIVING_MODE,
      now: THURSDAY_OPEN,
    })).toBe(false);
    expect(shouldShowOpenSign({
      slug: FRONT_WINDOW_SLUG,
      setting: "on",
      mode: FRIENDSGIVING_MODE,
      now: WEDNESDAY,
    })).toBe(false);
    expect(displayNeedsOpenSignStats(front, THURSDAY_OPEN)).toBe(false);
    expect(displayShowsStudioBookings(front)).toBe(false);

    const studio = resolveDisplayState({
      display: { ...front, slug: "studio-vertical" },
      now: THURSDAY_OPEN,
    });
    expect(studio.mode).toBe("custom_message");
  });

  it("returns to the normal winner as soon as another mode is selected", () => {
    const back = publicPayloadForDisplay({
      ...front,
      mode: "film_stats",
    }, {
      now: THURSDAY_OPEN,
      film: { rollsProcessing: 4 },
    });
    expect(back.mode).toBe("custom_message");
    expect(back.data).toEqual({ message: "Back in ten minutes" });
    expect(back.openSign).toBe("auto");

    const quiet = publicPayloadForDisplay({
      ...front,
      mode: "idle",
      override_mode: null,
      override_payload: null,
      show_studio_bookings: false,
    }, { now: THURSDAY_OPEN });
    expect(quiet.mode).toBe("idle");
    expect(quiet.openSign).toBe("auto");
    expect(quiet.showOpenSign).toBe(true);
  });

  it("paints the video from a config poll and does not fetch film data", () => {
    const previous = config({ mode: "film_menu", overrideMode: null, overrideMessage: null });
    const decision = reconcileDisplayConfig({
      slug: FRONT_WINDOW_SLUG,
      config: config(),
      now: PARTY,
      current: {
        payload: {
          mode: "film_menu",
          theme: "crt-green",
          refreshSeconds: 30,
          buildId: "dev",
          data: {},
          openSign: "on",
          showOpenSign: true,
        },
        fetchedAt: PARTY.getTime() - 60_000,
      },
      previousConfig: previous,
      modes: {},
      openSignStats: null,
    });
    expect(decision.fetchContent).toBe(false);
    expect(decision.payload?.mode).toBe(FRIENDSGIVING_MODE);
    expect(decision.payload).not.toHaveProperty("showOpenSign");
    expect(decision.payload?.data).toEqual({});

    const restored = reconcileDisplayConfig({
      slug: FRONT_WINDOW_SLUG,
      config: config({ mode: "idle" }),
      now: PARTY,
      current: {
        payload: decision.payload as DisplayPayload,
        fetchedAt: PARTY.getTime(),
      },
      previousConfig: config(),
      modes: {},
      openSignStats: null,
    });
    expect(restored.fetchContent).toBe(false);
    expect(restored.payload?.mode).toBe("custom_message");
    expect(restored.payload?.data).toEqual({ message: "Back in ten minutes" });
  });

  it("fills the front window with the looping video and nothing else", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(THURSDAY_OPEN);
    const html = renderToStaticMarkup(
      <DisplayPlayer
        slug={FRONT_WINDOW_SLUG}
        orientation="landscape"
        initial={{
          mode: FRIENDSGIVING_MODE,
          theme: "yours-dark",
          refreshSeconds: 30,
          buildId: "dev",
          data: {},
          openSign: "on",
          showOpenSign: true,
        }}
        loadedBuildId="dev"
        preview
      />,
    );
    expect(html).toContain(`src="${FRIENDSGIVING_VIDEO_SRC}"`);
    expect(html).toContain("autoPlay");
    expect(html).toContain("loop");
    expect(html).toContain("playsInline");
    expect(html).toContain('preload="auto"');
    expect(html).toContain("muted");
    expect(html).toContain("object-contain");
    expect(html).toContain("bg-black");
    expect(html).toContain('data-display-mode="friendsgiving"');
    expect(html).not.toContain("controls");
    expect(html).not.toContain(">OPEN<");
    expect(html).not.toContain("data-display-chrome");
    expect(html).not.toContain("Welcome");
    expect(html).not.toContain("data-display-deadzone");

    const studio = renderToStaticMarkup(
      <DisplayPlayer
        slug="studio-vertical"
        orientation="portrait"
        initial={{
          mode: FRIENDSGIVING_MODE,
          theme: "yours-clean",
          refreshSeconds: 30,
          buildId: "dev",
          data: {},
        }}
        loadedBuildId="dev"
        preview
      />,
    );
    expect(studio).not.toContain(FRIENDSGIVING_VIDEO_SRC);
  });

  it("restarts a finished or stuck video and resumes a pause", () => {
    expect(friendsgivingPlaybackAction({
      paused: true,
      ended: true,
      currentTime: 16,
      previousTime: 15,
    })).toBe("restart");
    expect(friendsgivingPlaybackAction({
      paused: false,
      ended: false,
      currentTime: 8,
      previousTime: 8,
    })).toBe("restart");
    expect(friendsgivingPlaybackAction({
      paused: true,
      ended: false,
      currentTime: 4,
      previousTime: 3,
    })).toBe("play");
    expect(friendsgivingPlaybackAction({
      paused: false,
      ended: false,
      currentTime: 4,
      previousTime: 3,
    })).toBe("none");
    expect(friendsgivingPlaybackAction({
      paused: true,
      ended: false,
      currentTime: 0,
      previousTime: null,
    })).toBe("play");
  });
});
