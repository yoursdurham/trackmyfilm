import { describe, expect, it } from "vitest";
import {
  EARTH_CIRCUMFERENCE_MILES,
  MILES_PER_DROPOFF,
  allTimeMiles,
  formatMiles,
  labRunsElapsed,
  lapRings,
  lapsCaption,
  legacyDropoffsForYear,
  shopMidnight,
  shopYearWindow,
  toPublicMiles,
} from "@/lib/miles-saved";

const PUBLISHED_AT = new Date("2026-10-21T18:41:00.000Z");

describe("miles saved", () => {
  it("anchors the shop year at America/New_York midnight", () => {
    expect(shopMidnight(2026, 1, 1).toISOString()).toBe("2026-01-01T05:00:00.000Z");
    expect(shopMidnight(2026, 7, 1).toISOString()).toBe("2026-07-01T04:00:00.000Z");

    const during = shopYearWindow(PUBLISHED_AT);
    expect(during.year).toBe(2026);
    expect(during.startIso).toBe("2026-01-01T05:00:00.000Z");
    expect(during.endIso).toBe("2027-01-01T05:00:00.000Z");

    const still2025 = shopYearWindow(new Date("2026-01-01T04:30:00.000Z"));
    expect(still2025.year).toBe(2025);
    expect(still2025.startIso).toBe("2025-01-01T05:00:00.000Z");
  });

  it("counts two whole lab runs per elapsed week and no partial run", () => {
    const start = shopYearWindow(PUBLISHED_AT).start;
    expect(labRunsElapsed(start, start)).toBe(0);
    expect(labRunsElapsed(new Date(start.getTime() + 3.5 * 24 * 60 * 60 * 1000 - 1), start)).toBe(0);
    expect(labRunsElapsed(new Date(start.getTime() + 3.5 * 24 * 60 * 60 * 1000), start)).toBe(1);
    expect(labRunsElapsed(PUBLISHED_AT, start)).toBe(83);
    expect(labRunsElapsed(new Date("2026-10-18T16:59:00.000Z"), start)).toBe(82);
  });

  it("adds the 2026 sheet gap only in 2026", () => {
    expect(legacyDropoffsForYear(2026)).toBe(479);
    expect(legacyDropoffsForYear(2025)).toBe(0);
    expect(legacyDropoffsForYear(2027)).toBe(0);
  });

  it("matches the published miles for 681 orders on Oct 21, 2026", () => {
    const window = shopYearWindow(PUBLISHED_AT);
    const result = toPublicMiles({
      legacyDropoffs: legacyDropoffsForYear(window.year),
      ordersCreated: 681,
      labRuns: labRunsElapsed(PUBLISHED_AT, window.start),
    });
    expect(result.miles).toBe(34_464);
    expect(result.miles).toBe((479 + 681 - 83) * MILES_PER_DROPOFF);
    expect(result.laps).toBeCloseTo(34_464 / EARTH_CIRCUMFERENCE_MILES, 10);
    expect(Object.keys(result).sort()).toEqual(["laps", "miles"]);
    expect(formatMiles(result.miles)).toBe("34,464");
    expect(lapsCaption(result.laps)).toBe("That's 1.4 times around the Earth.");
    expect(lapRings(result.laps)).toEqual([1, 0.4]);
  });

  it("describes a partial lap as a percent and clamps a negative trip count", () => {
    const partial = toPublicMiles({ legacyDropoffs: 0, ordersCreated: 10, labRuns: 0 });
    expect(partial.miles).toBe(320);
    expect(lapsCaption(partial.laps)).toBe("That's 1% of the way around the Earth.");
    expect(lapRings(partial.laps)).toEqual([0.01]);

    const none = toPublicMiles({ legacyDropoffs: 0, ordersCreated: 2, labRuns: 5 });
    expect(none).toEqual({ miles: 0, laps: 0 });
    expect(lapsCaption(none.laps)).toBe("That's 0% of the way around the Earth.");
    expect(lapRings(none.laps)).toEqual([0]);
  });

  it("says one time for a single lap and keeps extra laps on an outer ring", () => {
    const oneLap = toPublicMiles({ legacyDropoffs: 0, ordersCreated: 779, labRuns: 0 });
    expect(oneLap.miles).toBe(24_928);
    expect(lapsCaption(oneLap.laps)).toBe("That's 1 time around the Earth.");
    expect(lapRings(oneLap.laps)).toEqual([1]);

    const extra = toPublicMiles({ legacyDropoffs: 0, ordersCreated: 818, labRuns: 0 });
    expect(lapsCaption(extra.laps)).toBe("That's 1.1 times around the Earth.");
    expect(lapRings(extra.laps)).toEqual([1, 0.1]);
  });

  it("keeps the 2026 sheet and lab runs from Jan 1 2026 in the all-time total", () => {
    const sameYear = allTimeMiles({ ordersCreated: 681, now: PUBLISHED_AT });
    expect(sameYear.miles).toBe(34_464);
    expect(sameYear.miles).toBe((479 + 681 - 83) * MILES_PER_DROPOFF);

    const later = new Date("2027-02-01T17:00:00.000Z");
    const yearWindow = shopYearWindow(later);
    const yearOnly = toPublicMiles({
      legacyDropoffs: legacyDropoffsForYear(yearWindow.year),
      ordersCreated: 10,
      labRuns: labRunsElapsed(later, yearWindow.start),
    });
    const allTime = allTimeMiles({ ordersCreated: 681 + 10, now: later });
    const labRunsSinceBaseline = labRunsElapsed(later, shopMidnight(2026, 1, 1));
    expect(yearOnly.miles).toBe((10 - labRunsElapsed(later, yearWindow.start)) * MILES_PER_DROPOFF);
    expect(allTime.miles).toBe((479 + 681 + 10 - labRunsSinceBaseline) * MILES_PER_DROPOFF);
    expect(allTime.miles).toBeGreaterThan(yearOnly.miles);
  });

  it("leaves the 2026 sheet out of a later year", () => {
    const now = new Date("2027-02-01T17:00:00.000Z");
    const window = shopYearWindow(now);
    expect(window.year).toBe(2027);
    const result = toPublicMiles({
      legacyDropoffs: legacyDropoffsForYear(window.year),
      ordersCreated: 10,
      labRuns: labRunsElapsed(now, window.start),
    });
    expect(result.miles).toBe((10 - labRunsElapsed(now, window.start)) * MILES_PER_DROPOFF);
    expect(result.miles % MILES_PER_DROPOFF).toBe(0);
  });
});
