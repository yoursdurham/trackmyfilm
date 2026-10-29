import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DisplayPlayer from "../components/display/DisplayPlayer";
import { isSelectableDefaultMode, publicPayloadForDisplay, toPublicDisplayPayload } from "../lib/display";
import { halloweenCountdown, halloweenRollCount } from "../lib/halloween-display";
import type { DisplayPayload } from "../lib/display";

describe("halloweenCountdown", () => {
  it("counts down to midnight at the start of October 31, New York", () => {
    const oct30 = halloweenCountdown(new Date("2026-10-30T20:00:00.000Z"));
    expect(oct30).toEqual({ phase: "countdown", days: 0, hours: 8, minutes: 0, seconds: 0 });
  });

  it("replaces the count with the day itself on October 31", () => {
    expect(halloweenCountdown(new Date("2026-10-31T04:00:00.000Z"))).toEqual({ phase: "today" });
    expect(halloweenCountdown(new Date("2026-10-31T20:00:00.000Z"))).toEqual({ phase: "today" });
  });

  it("aims at the next October 31 after the day has passed", () => {
    const next = halloweenCountdown(new Date("2026-11-02T16:00:00.000Z"));
    expect(next.phase).toBe("countdown");
    if (next.phase === "countdown") expect(next.days).toBeGreaterThan(300);
  });
});

describe("halloween mode", () => {
  it("is selectable and keeps the roll count as a plain number", () => {
    expect(isSelectableDefaultMode("halloween")).toBe(true);
    expect(halloweenRollCount(251)).toBe(251);
    expect(halloweenRollCount(251.4)).toBe(251);
    expect(halloweenRollCount(-1)).toBeNull();
    expect(halloweenRollCount("251")).toBeNull();

    const payload = toPublicDisplayPayload({
      mode: "halloween",
      theme: "yours-dark",
      refreshSeconds: 30,
      buildId: "dev",
      data: { rolls: 251, customer_name: "Avery Sample", message: "nope" },
    });
    expect(payload.data).toEqual({ rolls: 251 });
    expect(JSON.stringify(payload)).not.toMatch(/Avery|Sample/);
  });

  it("resolves Halloween without turning it into the studio CRT theme", () => {
    const light = publicPayloadForDisplay({
      mode: "halloween",
      theme: "yours-clean",
      is_enabled: true,
      override_mode: null,
      override_payload: null,
    }, { rolls: 12 });
    expect(light.mode).toBe("halloween");
    expect(light.theme).toBe("yours-clean");
    expect(light.data).toEqual({ rolls: 12 });

    const dark = publicPayloadForDisplay({
      mode: "halloween",
      theme: "yours-dark",
      is_enabled: true,
      override_mode: null,
      override_payload: null,
    });
    expect(dark.theme).toBe("yours-dark");
    expect(dark.data).toEqual({});
  });
});

function screen(rolls?: number): DisplayPayload {
  return {
    mode: "halloween",
    theme: "yours-dark",
    refreshSeconds: 30,
    buildId: "dev",
    data: rolls === undefined ? {} : { rolls },
  };
}

describe("halloween rendering", () => {
  it("fills the front window with no dead zone", () => {
    const html = renderToStaticMarkup(
      <DisplayPlayer slug="front-window" orientation="landscape" initial={screen(40)} loadedBuildId="dev" preview />,
    );
    expect(html).toContain("data-display-orientation=\"landscape\"");
    expect(html).toContain("data-halloween-orientation=\"landscape\"");
    expect(html).toContain("data-display-safe-inset=\"0\"");
    expect(html).not.toContain("data-display-deadzone");
    expect(html).toContain("Happy");
    expect(html).toContain("Halloween");
    expect(html).toContain("data-halloween-rolls");
    expect(html).toContain(">40<");
    expect(html).toContain("data-halloween-sprockets=\"horizontal\"");
    expect(html).not.toMatch(/Avery|Sample|\.exe|C:\\\\/);
  });

  it("keeps the studio dead zone and stacks the tall layout", () => {
    const html = renderToStaticMarkup(
      <DisplayPlayer slug="studio-vertical" orientation="portrait" initial={screen()} loadedBuildId="dev" preview />,
    );
    expect(html).toContain("data-display-orientation=\"portrait\"");
    expect(html).toContain("data-halloween-orientation=\"portrait\"");
    expect(html).toContain("data-display-safe-inset=\"222\"");
    expect(html).toContain("data-display-deadzone");
    expect(html).toContain("data-halloween-sprockets=\"vertical\"");
    expect(html).not.toContain("data-halloween-rolls");
    expect(html).not.toContain("data-display-chrome=\"tmf\"");
  });
});
