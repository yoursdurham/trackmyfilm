import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DisplayPlayer from "../components/display/DisplayPlayer";
import OpenSignScreen from "../components/display/OpenSignScreen";
import { isSelectableDefaultMode, publicPayloadForDisplay } from "../lib/display";
import { isShopOpen, RETAIL_HOURS_LABEL } from "../lib/shop-hours";
import type { DisplayPayload } from "../lib/display";

const THURSDAY_OPEN = new Date("2026-10-29T22:00:00.000Z");
const THURSDAY_CLOSED = new Date("2026-10-29T23:00:00.000Z");
const SATURDAY_OPEN = new Date("2026-10-31T15:30:00.000Z");
const SATURDAY_CLOSED = new Date("2026-10-31T18:00:00.000Z");
const WEDNESDAY = new Date("2026-10-28T16:00:00.000Z");

describe("shop retail hours", () => {
  it("uses the hours already published on the site", () => {
    expect(RETAIL_HOURS_LABEL).toBe("Retail Hours: Thursdays 5-7PM & Saturdays 11-2PM");
  });

  it("is open only during Thursday 5-7PM and Saturday 11-2PM New York", () => {
    expect(isShopOpen(THURSDAY_OPEN)).toBe(true);
    expect(isShopOpen(new Date("2026-10-29T21:00:00.000Z"))).toBe(true);
    expect(isShopOpen(THURSDAY_CLOSED)).toBe(false);
    expect(isShopOpen(new Date("2026-10-29T20:59:00.000Z"))).toBe(false);
    expect(isShopOpen(SATURDAY_OPEN)).toBe(true);
    expect(isShopOpen(new Date("2026-10-31T15:00:00.000Z"))).toBe(true);
    expect(isShopOpen(SATURDAY_CLOSED)).toBe(false);
    expect(isShopOpen(WEDNESDAY)).toBe(false);
  });
});

describe("open sign mode", () => {
  it("is a selectable display mode and does not become the studio CRT theme", () => {
    expect(isSelectableDefaultMode("open_sign")).toBe(true);
    const payload = publicPayloadForDisplay({
      mode: "open_sign",
      theme: "yours-dark",
      is_enabled: true,
      override_mode: null,
      override_payload: null,
    });
    expect(payload.mode).toBe("open_sign");
    expect(payload.theme).toBe("yours-dark");
    expect(payload.data).toEqual({});
  });
});

const screen: DisplayPayload = {
  mode: "open_sign",
  theme: "yours-dark",
  refreshSeconds: 30,
  buildId: "dev",
  data: {},
};

describe("open sign rendering", () => {
  it("lights OPEN on the front window with no dead zone", () => {
    const html = renderToStaticMarkup(
      <DisplayPlayer slug="front-window" orientation="landscape" initial={screen} loadedBuildId="dev" preview />,
    );
    expect(html).toContain("data-display-mode=\"open_sign\"");
    expect(html).toContain("data-open-sign-orientation=\"landscape\"");
    expect(html).toContain("data-display-safe-inset=\"0\"");
    expect(html).not.toContain("data-display-deadzone");
    expect(html).toContain("Thursdays 5-7PM");
    expect(html).toContain("Saturdays 11-2PM");
    expect(html).toContain("data-retail-hours=\"Retail Hours: Thursdays 5-7PM &amp; Saturdays 11-2PM\"");
  });

  it("keeps the studio dead zone", () => {
    const html = renderToStaticMarkup(
      <DisplayPlayer slug="studio-vertical" orientation="portrait" initial={screen} loadedBuildId="dev" preview />,
    );
    expect(html).toContain("data-open-sign-orientation=\"portrait\"");
    expect(html).toContain("data-display-safe-inset=\"222\"");
    expect(html).toContain("data-display-deadzone");
  });

  it("dims to CLOSED outside the published hours", () => {
    const closed = renderToStaticMarkup(<OpenSignScreen orientation="landscape" now={WEDNESDAY} />);
    expect(closed).toContain("data-open-sign=\"closed\"");
    expect(closed).toContain(">CLOSED<");
    expect(closed).toContain("is-closed");

    const open = renderToStaticMarkup(<OpenSignScreen orientation="landscape" now={THURSDAY_OPEN} />);
    expect(open).toContain("data-open-sign=\"open\"");
    expect(open).toContain(">OPEN<");
    expect(open).not.toContain("is-closed");
  });
});
