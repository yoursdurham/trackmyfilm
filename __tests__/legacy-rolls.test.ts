import { describe, expect, it } from "vitest";
import {
  LEGACY_2026_SHEET_DROPOFFS,
  LEGACY_DROPOFF_COUNT,
  LEGACY_ROLLS_PER_DROPOFF,
  countFilmRollsDeveloped,
  legacyRollsExact,
  legacyRollsRounded,
  totalFilmRollsDeveloped,
} from "@/lib/legacy-rolls";

describe("legacy drop-off rolls", () => {
  it("keeps the sheet aggregate and the 1.5 rolls per drop-off", () => {
    expect(LEGACY_DROPOFF_COUNT).toBe(963);
    expect(LEGACY_ROLLS_PER_DROPOFF).toBe(1.5);
    expect(legacyRollsExact()).toBe(1444.5);
    expect(legacyRollsRounded()).toBe(1445);
  });

  it("keeps the 2026 sheet drop-offs separate from the all-time roll estimate", () => {
    expect(LEGACY_2026_SHEET_DROPOFFS).toBe(479);
    expect(totalFilmRollsDeveloped([], true)).toBe(1445);
  });

  it("counts stored rolls and leaves the legacy estimate out", () => {
    const rolls = countFilmRollsDeveloped([
      { roll_count: 4, roll_details: [{}, {}, { blank: true }] },
      { roll_count: 2 },
      { roll_count: 0 },
      { roll_details: [] },
    ]);
    expect(rolls).toBe(5);
    expect(totalFilmRollsDeveloped([
      { roll_count: 4, roll_details: [{}, {}, { blank: true }] },
      { roll_count: 2 },
    ], false)).toBe(5);
  });

  it("adds the rounded pre-2026 rolls only when asked", () => {
    const orders = [{ roll_count: 10 }];
    expect(totalFilmRollsDeveloped(orders, false)).toBe(10);
    expect(totalFilmRollsDeveloped(orders, true)).toBe(1455);
    expect(totalFilmRollsDeveloped([], true)).toBe(1445);
  });
});
