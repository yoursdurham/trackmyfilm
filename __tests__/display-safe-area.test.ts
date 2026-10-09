import { describe, expect, it } from "vitest";
import { DISPLAY_SAFE_AREA, displaySafeArea, toPublicDisplayPayload } from "../lib/display";

describe("displaySafeArea", () => {
  it("insets studio-vertical by 210px on the left", () => {
    expect(DISPLAY_SAFE_AREA["studio-vertical"]).toEqual({ left: 210 });
    expect(displaySafeArea("studio-vertical")).toEqual({ left: 210 });
  });

  it("leaves every other slug full bleed", () => {
    expect(displaySafeArea("lobby")).toEqual({ left: 0 });
    expect(displaySafeArea("")).toEqual({ left: 0 });
    expect(displaySafeArea("constructor")).toEqual({ left: 0 });
    expect(displaySafeArea("__proto__")).toEqual({ left: 0 });
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
