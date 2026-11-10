import { describe, expect, it } from "vitest";
import {
  applyFilmListingToRolls,
  CUSTOMER_FILM_NOTE_PREFIX,
  FILM_STOCK_MATCH_THRESHOLD,
  matchFilmStock,
  mergeCustomerFilmNote,
  parseFilmListing,
  scoreFilmStock,
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
    expect(matchFilmStock("Pheonix 200 - Blue")).toBe("Phoenix 200 - Blue");
    expect(matchFilmStock("Phoenix 200 - Blue")).toBe("Phoenix 200 - Blue");
  });

  it("does not guess when several stocks share the name", () => {
    expect(matchFilmStock("portra")).toBeNull();
    expect(matchFilmStock("tmax")).toBeNull();
    expect(matchFilmStock("superia")).toBeNull();
    expect(matchFilmStock("400")).toBeNull();
    expect(matchFilmStock("not a film")).toBeNull();
  });

  it("scores shorthand and typos against one catalog stock", () => {
    const ultramax = scoreFilmStock("Ultramax 400");
    expect(ultramax).toMatchObject({ stock: "Kodak UltraMax 400", created: false });
    expect(ultramax.confidence).toBeGreaterThanOrEqual(FILM_STOCK_MATCH_THRESHOLD);

    const hp5 = scoreFilmStock("HP5");
    expect(hp5).toMatchObject({ stock: "Ilford HP5 Plus 400", created: false });
    expect(hp5.confidence).toBeGreaterThanOrEqual(FILM_STOCK_MATCH_THRESHOLD);

    const reflex = scoreFilmStock("Reflex 800");
    expect(reflex).toMatchObject({ stock: "Reflx Labs 800T", created: false });
    expect(reflex.confidence).toBeGreaterThanOrEqual(FILM_STOCK_MATCH_THRESHOLD);
    expect(scoreFilmStock("Reflx Lab 800T").stock).toBe("Reflx Labs 800T");
    expect(scoreFilmStock("Reflex 400").stock).toBe("Reflx Labs 400D");
    expect(scoreFilmStock("800T").stock).toBe("Cinestill 800T");
  });

  it("creates a new stock when nothing is close enough", () => {
    const created = scoreFilmStock("mystery emulsion");
    expect(created).toMatchObject({
      stock: "mystery emulsion",
      created: true,
      confidence: expect.any(Number),
    });
    expect(created.confidence).toBeLessThan(FILM_STOCK_MATCH_THRESHOLD);

    const ambiguous = scoreFilmStock("portra");
    expect(ambiguous.created).toBe(true);
    expect(ambiguous.stock).toBe("portra");
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
    expect(applied.unmatchedNote).toBe(`${CUSTOMER_FILM_NOTE_PREFIX} Ultramax 400`);
    expect(applied.rolls[0].film_stock_created).toBeUndefined();
    expect(applied.rolls[0].film_stock_confidence).toBeGreaterThanOrEqual(FILM_STOCK_MATCH_THRESHOLD);
  });

  it("assigns stocks in order and leaves extra rolls blank when more than one was listed", () => {
    const applied = stocks("Portra 400, Ultramax 400", 3);
    expect(applied.rolls.map((roll) => roll.film_stock ?? "")).toEqual([
      "Kodak Portra 400",
      "Kodak UltraMax 400",
      "",
    ]);
    expect(applied.unmatchedNote).toBe(`${CUSTOMER_FILM_NOTE_PREFIX} Portra 400, Ultramax 400`);
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

  it("creates a new stock and still keeps the original note", () => {
    const applied = stocks("mystery emulsion", 2);
    expect(applied.rolls.map((roll) => roll.film_stock)).toEqual(["mystery emulsion", "mystery emulsion"]);
    expect(applied.rolls.every((roll) => roll.film_stock_created === true)).toBe(true);
    expect(applied.unmatchedNote).toBe(`${CUSTOMER_FILM_NOTE_PREFIX} mystery emulsion`);
  });

  it("keeps the raw text when only part of the list matches", () => {
    const applied = stocks("Ultramax 400, mystery emulsion", 2);
    expect(applied.rolls[0].film_stock).toBe("Kodak UltraMax 400");
    expect(applied.rolls[0].film_stock_created).toBeUndefined();
    expect(applied.rolls[1].film_stock).toBe("mystery emulsion");
    expect(applied.rolls[1].film_stock_created).toBe(true);
    expect(applied.unmatchedNote).toBe(`${CUSTOMER_FILM_NOTE_PREFIX} Ultramax 400, mystery emulsion`);
  });

  it("does not assign a stock to a disposable roll", () => {
    const applied = applyFilmListingToRolls(
      [
        { film_type: "Disposable Camera", film_stock: "Kodak Gold 200" },
        { film_type: "35mm" },
      ],
      "FunSaver, Portra 400",
    );
    expect(applied.rolls[0].film_stock).toBeUndefined();
    expect(applied.rolls[1].film_stock).toBe("Kodak Portra 400");
    expect(applied.unmatchedNote).toBe(`${CUSTOMER_FILM_NOTE_PREFIX} FunSaver, Portra 400`);
  });

  it("does not duplicate a note that is already present", () => {
    const note = `${CUSTOMER_FILM_NOTE_PREFIX} mystery emulsion`;
    expect(mergeCustomerFilmNote("bag 4", note)).toBe(`bag 4\n${note}`);
    expect(mergeCustomerFilmNote(`bag 4\n${note}`, note)).toBe(`bag 4\n${note}`);
    expect(mergeCustomerFilmNote(null, null)).toBeNull();
  });
});
