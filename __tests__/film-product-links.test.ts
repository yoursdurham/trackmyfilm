import { describe, expect, it } from "vitest";
import { correctFilmStockSpelling, FILM_STOCKS } from "../lib/film-stocks";
import { FILM_PRODUCT_LINKS, filmProductUrl, KODAK_FUNSAVER_URL } from "../lib/film-product-links";

const FORMATS = ["35mm", "120"] as const;

describe("filmProductUrl", () => {
  it("links a stock only to the product for that format", () => {
    expect(filmProductUrl("Kodak Portra 160", "35mm")).toBe(
      "https://www.yoursdurham.com/shopping/p/kodak-portra-160-35mm",
    );
    expect(filmProductUrl("Kodak Portra 160", "120")).toBe(
      "https://www.yoursdurham.com/shopping/p/kodak-portra-160-120",
    );
    expect(filmProductUrl("Cinestill 800T", "120")).toBe(
      "https://www.yoursdurham.com/shopping/p/cinestill-800t-120",
    );
    expect(filmProductUrl("Kodak Tri-X 400", "120")).toBe(
      "https://www.yoursdurham.com/shopping/p/kodak-400tx-120",
    );
    expect(filmProductUrl("Kodak T-Max 400", "120")).toBe(
      "https://www.yoursdurham.com/shopping/p/kodak-400-tmax",
    );
    expect(filmProductUrl("Kodak T-Max 400", "35mm")).toBe(
      "https://www.yoursdurham.com/shopping/p/kodak-400-tmax-35mm",
    );
    expect(filmProductUrl("Lomography Color 400", "35mm")).toBe(
      "https://www.yoursdurham.com/shopping/p/lomography-color-negative-400-35mm-3-pack-36-exp",
    );
  });

  it("does not fall back to the other format", () => {
    expect(filmProductUrl("Kodak UltraMax 400", "35mm")).toBe(
      "https://www.yoursdurham.com/shopping/p/kodak-ultramax-400-35mm",
    );
    expect(filmProductUrl("Kodak UltraMax 400", "120")).toBeNull();
    expect(filmProductUrl("Kodak ColorPlus 200", "120")).toBeNull();
    expect(filmProductUrl("Ilford HP5 Plus 400", "120")).toBeNull();
    expect(filmProductUrl("Lomography Color 400", "120")).toBeNull();
    expect(filmProductUrl("Kodak Portra 160", "110")).toBeNull();
    expect(filmProductUrl("Kodak Portra 160", null)).toBeNull();
    expect(filmProductUrl("Kodak Portra 160")).toBeNull();
  });

  it("matches case, spacing, punctuation, and a dropped brand prefix within one format", () => {
    const portra35 = "https://www.yoursdurham.com/shopping/p/kodak-portra-160-35mm";
    const portra120 = "https://www.yoursdurham.com/shopping/p/kodak-portra-160-120";
    expect(filmProductUrl("kodak portra 160", "35 mm")).toBe(portra35);
    expect(filmProductUrl("PORTRA 160", "120")).toBe(portra120);
    expect(filmProductUrl("Kodak   Portra-160", "35MM")).toBe(portra35);
    expect(filmProductUrl("portra160", "35mm")).toBe(portra35);
    expect(filmProductUrl("ultra max 400", "35mm")).toBe(
      "https://www.yoursdurham.com/shopping/p/kodak-ultramax-400-35mm",
    );
    expect(filmProductUrl("HP5 Plus 400", "35mm")).toBe(
      "https://www.yoursdurham.com/shopping/p/ilford-hp5-plus-400",
    );
    expect(filmProductUrl("800T", "35mm")).toBe(
      "https://www.yoursdurham.com/shopping/p/cinestill-800t-35mm",
    );
    expect(filmProductUrl("800T", "120")).toBe(
      "https://www.yoursdurham.com/shopping/p/cinestill-800t-120",
    );
    expect(filmProductUrl("Tri-X 400", "35mm")).toBe(
      "https://www.yoursdurham.com/shopping/p/kodak-400-tri-x-35mm",
    );
  });

  it("leaves unsold stocks and ambiguous names unlinked", () => {
    expect(filmProductUrl("Kodak T-Max 100", "35mm")).toBeNull();
    expect(filmProductUrl("Fujifilm Superia 200", "120")).toBeNull();
    expect(filmProductUrl("Fujifilm Pro 400H", "35mm")).toBeNull();
    expect(filmProductUrl("Fujifilm Velvia 50", "120")).toBeNull();
    expect(filmProductUrl("Fujifilm Provia 100F", "35mm")).toBeNull();
    expect(filmProductUrl("Ilford Delta 400", "35mm")).toBeNull();
    expect(filmProductUrl("Ilford XP2 Super 400", "120")).toBeNull();
    expect(filmProductUrl("Fujifilm 400", "120")).toBeNull();
    expect(filmProductUrl("portra", "35mm")).toBeNull();
    expect(filmProductUrl("tmax", "120")).toBeNull();
    expect(filmProductUrl("not a film", "35mm")).toBeNull();
    expect(filmProductUrl("", "35mm")).toBeNull();
    expect(filmProductUrl(null, "35mm")).toBeNull();
  });

  it("only maps catalog stock and format pairs", () => {
    const catalog = new Set(FILM_STOCKS);
    const seen = new Set<string>();
    for (const link of FILM_PRODUCT_LINKS) {
      const key = `${link.stock}|${link.format}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(catalog.has(link.stock)).toBe(true);
      expect(FORMATS).toContain(link.format);
      expect(link.url.startsWith("https://www.yoursdurham.com/shopping/p/")).toBe(true);
      expect(filmProductUrl(link.stock, link.format)).toBe(link.url);
    }

    const unmatched = FILM_STOCKS.flatMap((stock) => (
      FORMATS
        .filter((format) => !FILM_PRODUCT_LINKS.some((link) => link.stock === stock && link.format === format))
        .map((format) => `${stock} ${format}`)
    ));
    expect(unmatched).toEqual([
      "Kodak UltraMax 400 120",
      "Kodak ColorPlus 200 120",
      "Kodak Kodacolor 200 120",
      "Kodak T-Max 100 35mm",
      "Kodak T-Max 100 120",
      "Kodak T-Max P3200 120",
      "Fujifilm Superia 400 120",
      "Fujifilm Superia 200 120",
      "Fujifilm Pro 400H 35mm",
      "Fujifilm Pro 400H 120",
      "Fujifilm Velvia 50 35mm",
      "Fujifilm Velvia 50 120",
      "Fujifilm Provia 100F 35mm",
      "Fujifilm Provia 100F 120",
      "Ilford HP5 Plus 400 120",
      "Ilford Delta 400 35mm",
      "Ilford Delta 400 120",
      "Ilford XP2 Super 400 35mm",
      "Ilford XP2 Super 400 120",
      "Lomography Color 400 120",
      "Lomography Color '92 35mm",
      "Lomography Color '92 120",
      "Lomography LomoChrome Metropolis 120",
      "Candido 400 120",
      "Candido 800 120",
    ]);
  });

  it("links newly catalogued 35mm stocks and their shop-title aliases", () => {
    const metropolis = "https://www.yoursdurham.com/shopping/p/lomography-lomochrome-metropolis-35mm-xr-100400-36-exp";
    const fuji200 = "https://www.yoursdurham.com/shopping/p/fuji-200-35mm";
    const fuji400 = "https://www.yoursdurham.com/shopping/p/fuji-400-35mm";
    const p3200 = "https://www.yoursdurham.com/shopping/p/kodak-t-max-3200";
    expect(filmProductUrl("Lomography LomoChrome Metropolis", "35mm")).toBe(metropolis);
    expect(filmProductUrl("Lomochrome Metropolis", "35mm")).toBe(metropolis);
    expect(filmProductUrl("Lomography LomoChrome Metropolis", "120")).toBeNull();
    expect(filmProductUrl("Fujifilm Superia 200", "35mm")).toBe(fuji200);
    expect(filmProductUrl("Fujifilm 200", "35mm")).toBe(fuji200);
    expect(filmProductUrl("Fujifilm Superia 400", "35mm")).toBe(fuji400);
    expect(filmProductUrl("Fujifilm 400", "35mm")).toBe(fuji400);
    expect(filmProductUrl("Kodak T-Max P3200", "35mm")).toBe(p3200);
    expect(filmProductUrl("Kodak TMax 3200", "35mm")).toBe(p3200);
    expect(filmProductUrl("Kodak P3200 T-Max", "35mm")).toBe(p3200);
    expect(filmProductUrl("Kodak T-Max P3200", "120")).toBeNull();
    expect(filmProductUrl("Candido 400", "35mm")).toBe(
      "https://www.yoursdurham.com/shopping/p/candido400-colour-film",
    );
    expect(filmProductUrl("CANDIDO800 COLOUR FILM", "35mm")).toBe(
      "https://www.yoursdurham.com/shopping/p/candido800-colour-film",
    );
    expect(filmProductUrl("Kodak Kodacolor 200", "35mm")).toBe(
      "https://www.yoursdurham.com/shopping/p/kodak-kodacolor-200",
    );
    expect(filmProductUrl("Lomography Color '92", "35mm")).toBeNull();
    expect(filmProductUrl("Lomography Color '92", "120")).toBeNull();
    expect(filmProductUrl("Harman Red 125", "35mm")).toBeNull();
    expect(filmProductUrl("Harman Red 125", "120")).toBeNull();
  });

  it("links Harman Phoenix and Azure by format, including the names already in the stock list", () => {
    const phoenix12535 = "https://www.yoursdurham.com/shopping/p/harman-phoenix-125-35mm";
    const phoenix125120 = "https://www.yoursdurham.com/shopping/p/harman-phoenix-125-120";
    const azure35 = "https://www.yoursdurham.com/shopping/p/harman-switch-azure-125-35mm";
    const azure120 = "https://www.yoursdurham.com/shopping/p/harman-switch-azure-125";
    const blue35 = "https://www.yoursdurham.com/shopping/p/harman-phoenix-ii-200";
    const blue120 = "https://www.yoursdurham.com/shopping/p/harman-phoenix-ii-200-color-120";

    expect(filmProductUrl("Phoenix 125", "35mm")).toBe(phoenix12535);
    expect(filmProductUrl("Harman Phoenix 125", "35mm")).toBe(phoenix12535);
    expect(filmProductUrl("Phoenix 125", "120")).toBe(phoenix125120);
    expect(filmProductUrl("Harman Phoenix 125", "120")).toBe(phoenix125120);
    expect(filmProductUrl("Phoenix 125", "110")).toBeNull();

    expect(filmProductUrl("Harman Azure 125", "35mm")).toBe(azure35);
    expect(filmProductUrl("Harman Azure", "35mm")).toBe(azure35);
    expect(filmProductUrl("Switch Azure", "35mm")).toBe(azure35);
    expect(filmProductUrl("Harman Azure 125", "120")).toBe(azure120);
    expect(filmProductUrl("Switch Azure", "120")).toBe(azure120);
    expect(filmProductUrl("Harman Azure 125", "35mm")).not.toBe(azure120);

    expect(filmProductUrl("Phoenix 200 - Blue", "35mm")).toBe(blue35);
    expect(filmProductUrl("Pheonix 200 - Blue", "35mm")).toBe(blue35);
    expect(filmProductUrl("Phoenix 200 - Blue", "120")).toBe(blue120);
    expect(filmProductUrl("Harman Phoenix 200 - Blue", "120")).toBe(blue120);
    expect(filmProductUrl("Phoenix 200 - Blue", "35mm")).not.toBe(blue120);
  });

  it("links every disposable camera to the Kodak FunSaver page", () => {
    expect(filmProductUrl("Kodak Portra 160", "Disposable Camera")).toBe(KODAK_FUNSAVER_URL);
    expect(filmProductUrl("anything", "Disposable")).toBe(KODAK_FUNSAVER_URL);
    expect(filmProductUrl("Kodak FunSaver", "35mm")).toBe(KODAK_FUNSAVER_URL);
    expect(filmProductUrl("Kodak Fun Saver", null)).toBe(KODAK_FUNSAVER_URL);
    expect(filmProductUrl(null, "Disposable Camera")).toBe(KODAK_FUNSAVER_URL);
  });

  it("rewrites the Pheonix misspelling for display", () => {
    expect(correctFilmStockSpelling("Pheonix 200 - Blue")).toBe("Phoenix 200 - Blue");
    expect(correctFilmStockSpelling("PHEONIX 200 - Blue")).toBe("Phoenix 200 - Blue");
    expect(correctFilmStockSpelling("Kodak Portra 160")).toBe("Kodak Portra 160");
  });
});
