import { describe, expect, it } from "vitest";
import { FILM_RECOMMENDATION_BLURBS } from "../lib/film-recommendation-blurbs";
import { filmProductUrl } from "../lib/film-product-links";
import { recommendNewFilms } from "../lib/film-recommendations";
import { buildAccountProfile, previewAccountProfile, type AccountOrderInput } from "../lib/account-profile";

function order(overrides: Partial<AccountOrderInput> = {}): AccountOrderInput {
  return {
    id: "order-1",
    order_number: "YM-1",
    customer_name: "Avery Sample",
    customer_email: "avery.sample@example.com",
    status: "Scans Sent",
    roll_count: 1,
    film_type: "35mm",
    film_stock: "Kodak UltraMax 400",
    dropoff_date: "2026-04-25",
    created_at: "2026-04-25T15:00:00.000Z",
    ...overrides,
  };
}

describe("film recommendation blurbs", () => {
  it("only describes stocks the shop map can link, in one or two plain sentences", () => {
    const names = new Set<string>();
    for (const blurb of FILM_RECOMMENDATION_BLURBS) {
      expect(names.has(blurb.stock)).toBe(false);
      names.add(blurb.stock);
      const href = filmProductUrl(blurb.stock, blurb.format);
      expect(href, blurb.stock).toMatch(/^https:\/\/www\.yoursdurham\.com\/shopping\//);
      expect(blurb.blurb).not.toMatch(/https?:|www\.|\.exe|terminal/i);
      const sentences = blurb.blurb.split(/(?<=[.!?])\s+/).filter(Boolean);
      expect(sentences.length).toBeGreaterThanOrEqual(1);
      expect(sentences.length).toBeLessThanOrEqual(2);
    }
  });
});

describe("recommendNewFilms", () => {
  it("suggests other color films to an UltraMax shooter and skips what they already shot", () => {
    const picks = recommendNewFilms([{ stock: "Kodak UltraMax 400", format: "35mm" }]);
    expect(picks.map((pick) => pick.stock)).toEqual([
      "Fujifilm Superia 400",
      "Kodak Gold 200",
      "Kodak Portra 400",
    ]);
    expect(picks.map((pick) => pick.href)).toEqual([
      "https://www.yoursdurham.com/shopping/p/fuji-400-35mm",
      "https://www.yoursdurham.com/shopping/p/kodak-gold-200-35mm",
      "https://www.yoursdurham.com/shopping/p/kodak-portra-400-35mm",
    ]);
    expect(picks.every((pick) => pick.format === "35mm")).toBe(true);
  });

  it("treats a shorthand Fuji 400 as already shot", () => {
    const picks = recommendNewFilms([{ stock: "Fuji 400", format: "35mm" }]);
    expect(picks.map((pick) => pick.stock)).not.toContain("Fujifilm Superia 400");
    expect(picks.every((pick) => pick.blurb.length > 0)).toBe(true);
  });

  it("keeps a black and white shooter in black and white, using their format when the shop has it", () => {
    const picks = recommendNewFilms([{ stock: "Kodak Tri-X 400", format: "120" }]);
    expect(picks.map((pick) => pick.stock)).toEqual([
      "Ilford HP5 Plus 400",
      "Kodak T-Max 400",
      "Kodak T-Max P3200",
    ]);
    expect(picks[0]?.href).toBe("https://www.yoursdurham.com/shopping/p/ilford-hp5-plus-400");
    expect(picks[1]?.format).toBe("120");
    expect(picks[1]?.href).toBe("https://www.yoursdurham.com/shopping/p/kodak-400-tmax");
    expect(picks.map((pick) => pick.stock).join(" ")).not.toMatch(/Portra|Gold|UltraMax|Fujifilm/);
  });

  it("uses a curated default set for a new customer", () => {
    expect(recommendNewFilms([]).map((pick) => pick.stock)).toEqual([
      "Kodak Gold 200",
      "Kodak Portra 400",
      "Ilford HP5 Plus 400",
    ]);
  });
});

describe("account recommendations stay on this customer's rolls", () => {
  it("does not treat another customer's stock as already shot", () => {
    const profile = buildAccountProfile({
      email: "avery.sample@example.com",
      firstName: "Avery",
      lastName: "Sample",
      orders: [
        order({
          id: "avery",
          roll_details: [{ film_type: "35mm", film_process: "Color", film_stock: "Kodak UltraMax 400" }],
        }),
        order({
          id: "someone-else",
          order_number: "YM-9999",
          customer_name: "Bea Knitter",
          customer_email: "bea@example.com",
          film_stock: "Fujifilm Superia 400",
          roll_details: [{ film_type: "35mm", film_process: "Color", film_stock: "Fujifilm Superia 400" }],
        }),
      ],
    });
    expect(profile.recommendations.map((pick) => pick.stock)).toContain("Fujifilm Superia 400");
    expect(JSON.stringify(profile.recommendations)).not.toContain("Bea");
    expect(JSON.stringify(profile.recommendations)).not.toContain("YM-9999");
    expect(profile.history.map((entry) => entry.orderNumber)).toEqual(["YM-1"]);
  });

  it("suggests films the preview customer has not shot", () => {
    const profile = previewAccountProfile(new Date("2026-10-22T15:00:00.000Z"));
    const stocks = profile.recommendations.map((pick) => pick.stock);
    expect(stocks).toHaveLength(3);
    expect(stocks).not.toEqual(expect.arrayContaining([
      "Kodak Portra 400",
      "Kodak Gold 200",
      "Ilford HP5 Plus 400",
      "Cinestill 800T",
    ]));
    expect(JSON.stringify(profile)).not.toContain("Bea Knitter");
  });
});
