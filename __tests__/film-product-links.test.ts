import { describe, expect, it } from "vitest";
import { FILM_STOCKS } from "../lib/film-stocks";
import { FILM_PRODUCT_LINKS, filmProductUrl } from "../lib/film-product-links";

describe("filmProductUrl", () => {
  it("links catalog stocks to their shop product", () => {
    expect(filmProductUrl("Kodak Portra 160")).toBe(
      "https://www.yoursdurham.com/shopping/p/kodak-portra-160-35mm",
    );
    expect(filmProductUrl("Cinestill 800T")).toBe(
      "https://www.yoursdurham.com/shopping/p/cinestill-800t-35mm",
    );
    expect(filmProductUrl("Kodak Gold 200")).toBe(
      "https://www.yoursdurham.com/shopping/p/kodak-gold-200-35mm",
    );
  });

  it("matches case, spacing, punctuation, and a dropped brand prefix", () => {
    const portra = "https://www.yoursdurham.com/shopping/p/kodak-portra-160-35mm";
    expect(filmProductUrl("kodak portra 160")).toBe(portra);
    expect(filmProductUrl("PORTRA 160")).toBe(portra);
    expect(filmProductUrl("Kodak   Portra-160")).toBe(portra);
    expect(filmProductUrl("portra160")).toBe(portra);
    expect(filmProductUrl("ultra max 400")).toBe(
      "https://www.yoursdurham.com/shopping/p/kodak-ultramax-400-35mm",
    );
    expect(filmProductUrl("HP5 Plus 400")).toBe(
      "https://www.yoursdurham.com/shopping/p/ilford-hp5-plus-400",
    );
    expect(filmProductUrl("800T")).toBe(
      "https://www.yoursdurham.com/shopping/p/cinestill-800t-35mm",
    );
    expect(filmProductUrl("Tri-X 400")).toBe(
      "https://www.yoursdurham.com/shopping/p/kodak-400-tri-x-35mm",
    );
  });

  it("leaves unsold catalog stocks and ambiguous names unlinked", () => {
    expect(filmProductUrl("Kodak T-Max 100")).toBeNull();
    expect(filmProductUrl("Fujifilm Superia 400")).toBeNull();
    expect(filmProductUrl("Fujifilm Superia 200")).toBeNull();
    expect(filmProductUrl("Fujifilm Pro 400H")).toBeNull();
    expect(filmProductUrl("Fujifilm Velvia 50")).toBeNull();
    expect(filmProductUrl("Fujifilm Provia 100F")).toBeNull();
    expect(filmProductUrl("Ilford Delta 400")).toBeNull();
    expect(filmProductUrl("Ilford XP2 Super 400")).toBeNull();
    expect(filmProductUrl("Fujifilm 400")).toBeNull();
    expect(filmProductUrl("portra")).toBeNull();
    expect(filmProductUrl("tmax")).toBeNull();
    expect(filmProductUrl("not a film")).toBeNull();
    expect(filmProductUrl("")).toBeNull();
    expect(filmProductUrl(null)).toBeNull();
  });

  it("only maps catalog names, and every mapped name resolves", () => {
    const catalog = new Set(FILM_STOCKS);
    for (const [stock, url] of Object.entries(FILM_PRODUCT_LINKS)) {
      expect(catalog.has(stock)).toBe(true);
      expect(url.startsWith("https://www.yoursdurham.com/shopping/p/")).toBe(true);
      expect(filmProductUrl(stock)).toBe(url);
    }
    const unmatched = FILM_STOCKS.filter((stock) => !FILM_PRODUCT_LINKS[stock]);
    expect(unmatched).toEqual([
      "Kodak T-Max 100",
      "Fujifilm Superia 400",
      "Fujifilm Superia 200",
      "Fujifilm Pro 400H",
      "Fujifilm Velvia 50",
      "Fujifilm Provia 100F",
      "Ilford Delta 400",
      "Ilford XP2 Super 400",
    ]);
  });
});
