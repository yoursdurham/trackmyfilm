import { describe, expect, it } from "vitest";
import { DISPLAY_SAFE_AREA, displaySafeArea, toPublicDisplayPayload } from "../lib/display";

describe("displaySafeArea", () => {
  it("insets studio-vertical by 222px on the left", () => {
    expect(DISPLAY_SAFE_AREA["studio-vertical"]).toEqual({ left: 222 });
    expect(displaySafeArea("studio-vertical")).toEqual({ left: 222 });
    expect(displaySafeArea("studio-vertical", "film_departures")).toEqual({ left: 222 });
    expect(displaySafeArea("studio-vertical", "idle")).toEqual({ left: 222 });
  });

  it("insets the studio stats layout by 215px", () => {
    expect(displaySafeArea("studio-vertical", "film_stats")).toEqual({ left: 215 });
    expect(displaySafeArea("lobby", "film_stats")).toEqual({ left: 0 });
  });

  it("leaves every other slug full bleed", () => {
    expect(displaySafeArea("lobby")).toEqual({ left: 0 });
    expect(displaySafeArea("")).toEqual({ left: 0 });
    expect(displaySafeArea("constructor")).toEqual({ left: 0 });
    expect(displaySafeArea("__proto__")).toEqual({ left: 0 });
  });

  it("gives the front window no dead zone, including film stats", () => {
    expect(DISPLAY_SAFE_AREA).not.toHaveProperty("front-window");
    expect(displaySafeArea("front-window")).toEqual({ left: 0 });
    expect(displaySafeArea("front-window", "idle")).toEqual({ left: 0 });
    expect(displaySafeArea("front-window", "film_stats")).toEqual({ left: 0 });
    expect(displaySafeArea("front-window", "film_departures")).toEqual({ left: 0 });
  });

  it("stays off the public payload", () => {
    const payload = toPublicDisplayPayload({
      mode: "film_departures",
      theme: "airport",
      refreshSeconds: 30,
      buildId: "dev",
      data: {},
    });
    expect(payload).not.toHaveProperty("safeArea");
    expect(payload).not.toHaveProperty("inset");
    expect(Object.keys(payload).sort()).toEqual(["buildId", "data", "mode", "refreshSeconds", "theme"]);
  });
});
