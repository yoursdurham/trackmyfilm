import { describe, expect, it } from "vitest";
import {
  applyFilmListingToRolls,
  CUSTOMER_FILM_NOTE_PREFIX,
  matchFilmStock,
  mergeCustomerFilmNote,
  parseFilmListing,
} from "../lib/film-stock-match";

function stocks(listing: string, rollCount: number, existing: Array<string | undefined> = []) {
  const rolls = Array.from({ length: rollCount }, (_, index) => (
    existing[index] ? { film_stock: existing[index] } : {}
  ));
  return applyFilmListingToRolls(rolls, listing);
}

describe("matchFilmStock", () => {
  it("matches ultramax ignoring case and spaces", () => {
    expect(matchFilmStock("ultramax")).toBe("Kodak UltraMax 400");
    expect(matchFilmStock("Ultramax 400")).toBe("Kodak UltraMax 400");
    expect(matchFilmStock("ULTRA MAX")).toBe("Kodak UltraMax 400");
    expect(matchFilmStock("Kodak Ultramax")).toBe("Kodak UltraMax 400");
  });

  it("matches common shorthand to one catalog stock", () => {
    expect(matchFilmStock("Portra 400")).toBe("Kodak Portra 400");
    expect(matchFilmStock("gold")).toBe("Kodak Gold 200");
    expect(matchFilmStock("hp5")).toBe("Ilford HP5 Plus 400");
    expect(matchFilmStock("tri-x")).toBe("Kodak Tri-X 400");
    expect(matchFilmStock("T-Max 400")).toBe("Kodak T-Max 400");
    expect(matchFilmStock("ektar")).toBe("Kodak Ektar 100");
    expect(matchFilmStock("800T")).toBe("Cinestill 800T");
    expect(matchFilmStock("Pro 400H")).toBe("Fujifilm Pro 400H");
  });

  it("does not guess when several stocks share the name", () => {
    expect(matchFilmStock("portra")).toBeNull();
    expect(matchFilmStock("tmax")).toBeNull();
    expect(matchFilmStock("superia")).toBeNull();
    expect(matchFilmStock("400")).toBeNull();
    expect(matchFilmStock("not a film")).toBeNull();
  });
});

describe("applyFilmListingToRolls", () => {
  it("splits on commas, newlines, and, ampersand, and plus", () => {
    expect(parseFilmListing("Portra 400, Ultramax 400").map((token) => token.stock)).toEqual([
      "Kodak Portra 400",
      "Kodak UltraMax 400",
    ]);
    expect(parseFilmListing("Portra 400 and Gold 200").map((token) => token.stock)).toEqual([
      "Kodak Portra 400",
      "Kodak Gold 200",
    ]);
    expect(parseFilmListing("Portra 400, and HP5").map((token) => token.stock)).toEqual([
      "Kodak Portra 400",
      "Ilford HP5 Plus 400",
    ]);
    expect(parseFilmListing("Portra 400 & Tri-X").map((token) => token.stock)).toEqual([
      "Kodak Portra 400",
      "Kodak Tri-X 400",
    ]);
    expect(parseFilmListing("Portra 400 + Delta 400").map((token) => token.stock)).toEqual([
      "Kodak Portra 400",
      "Ilford Delta 400",
    ]);
    expect(parseFilmListing("Portra 400\nUltramax 400").map((token) => token.stock)).toEqual([
      "Kodak Portra 400",
      "Kodak UltraMax 400",
    ]);
  });

  it("expands 2x and x2 quantities", () => {
    expect(parseFilmListing("2x Portra 400").map((token) => token.count)).toEqual([2]);
    expect(parseFilmListing("2 x Portra 400")[0]).toMatchObject({ count: 2, stock: "Kodak Portra 400" });
    expect(parseFilmListing("Portra 400 x2")[0]).toMatchObject({ count: 2, stock: "Kodak Portra 400" });
    expect(parseFilmListing("Portra 400 x 2")[0]).toMatchObject({ count: 2, stock: "Kodak Portra 400" });
    expect(parseFilmListing("Kodak T-Max 400")[0]).toMatchObject({ count: 1, stock: "Kodak T-Max 400" });
  });

  it("repeats one listed stock across every roll", () => {
    const applied = stocks("Ultramax 400", 3);
    expect(applied.rolls.map((roll) => roll.film_stock)).toEqual([
      "Kodak UltraMax 400",
      "Kodak UltraMax 400",
      "Kodak UltraMax 400",
    ]);
    expect(applied.unmatchedNote).toBeNull();
  });

  it("assigns stocks in order and leaves extra rolls blank when more than one was listed", () => {
    const applied = stocks("Portra 400, Ultramax 400", 3);
    expect(applied.rolls.map((roll) => roll.film_stock ?? "")).toEqual([
      "Kodak Portra 400",
      "Kodak UltraMax 400",
      "",
    ]);
    expect(applied.unmatchedNote).toBeNull();
  });

  it("does not repeat past an explicit quantity", () => {
    const leading = stocks("2x Portra 400", 3);
    expect(leading.rolls.map((roll) => roll.film_stock ?? "")).toEqual([
      "Kodak Portra 400",
      "Kodak Portra 400",
      "",
    ]);
    const trailing = stocks("Portra 400 x2", 3);
    expect(trailing.rolls.map((roll) => roll.film_stock ?? "")).toEqual([
      "Kodak Portra 400",
      "Kodak Portra 400",
      "",
    ]);
  });

  it("keeps a stock that is already on the roll", () => {
    const applied = stocks("Ultramax 400", 2, ["Kodak Portra 800"]);
    expect(applied.rolls.map((roll) => roll.film_stock)).toEqual([
      "Kodak Portra 800",
      "Kodak UltraMax 400",
    ]);
  });

  it("puts an unmatched answer in the notes", () => {
    const applied = stocks("mystery emulsion", 2);
    expect(applied.rolls.every((roll) => !roll.film_stock)).toBe(true);
    expect(applied.unmatchedNote).toBe(`${CUSTOMER_FILM_NOTE_PREFIX} mystery emulsion`);
  });

  it("keeps the raw text when only part of the list matches", () => {
    const applied = stocks("Ultramax 400, mystery emulsion", 2);
    expect(applied.rolls[0].film_stock).toBe("Kodak UltraMax 400");
    expect(applied.rolls[1].film_stock).toBeUndefined();
    expect(applied.unmatchedNote).toBe(`${CUSTOMER_FILM_NOTE_PREFIX} Ultramax 400, mystery emulsion`);
  });

  it("does not duplicate a note that is already present", () => {
    const note = `${CUSTOMER_FILM_NOTE_PREFIX} mystery emulsion`;
    expect(mergeCustomerFilmNote("bag 4", note)).toBe(`bag 4\n${note}`);
    expect(mergeCustomerFilmNote(`bag 4\n${note}`, note)).toBe(`bag 4\n${note}`);
    expect(mergeCustomerFilmNote(null, null)).toBeNull();
  });
});
