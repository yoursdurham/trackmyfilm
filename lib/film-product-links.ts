/**
 * Product pages for the drop-off catalog in lib/film-stocks.ts.
 * Collected from the public Squarespace shop (shopping?format=json).
 * Each entry is one catalog stock in one format. Lookup ignores case, spacing,
 * and punctuation, and a leading Kodak / Fujifilm / Ilford / Cinestill / Lomography / Harman
 * prefix. A roll links only when that stock is sold in that roll's format.
 * Format comes from the product title or URL, except Kodak 400 TMax, which the
 * shop confirmed is the 120 T-Max 400 page. A multipack is used only when it is
 * the only product for that stock and format. Lomography Color 400 is the 35mm 3-pack.
 * Fujifilm 200 and 400 are the 35mm pages whose 3-roll option is a variant on that
 * same URL. Any Disposable Camera roll links to the Kodak FunSaver page.
 */
import { correctFilmStockSpelling } from "./film-stocks";

export type FilmShopFormat = "35mm" | "120";

const FUJI_200_35 = "https://www.yoursdurham.com/shopping/p/fuji-200-35mm";
const FUJI_400_35 = "https://www.yoursdurham.com/shopping/p/fuji-400-35mm";
const TMAX_P3200_35 = "https://www.yoursdurham.com/shopping/p/kodak-t-max-3200";
const CANDIDO_400_35 = "https://www.yoursdurham.com/shopping/p/candido400-colour-film";
const CANDIDO_800_35 = "https://www.yoursdurham.com/shopping/p/candido800-colour-film";
export const KODAK_FUNSAVER_URL = "https://www.yoursdurham.com/shopping/p/kodak-fun-saver-single-use-800-iso";

export type FilmProductLink = {
  stock: string;
  format: FilmShopFormat;
  url: string;
};

export const FILM_PRODUCT_LINKS: readonly FilmProductLink[] = [
  { stock: "Kodak Portra 160", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/kodak-portra-160-35mm" },
  { stock: "Kodak Portra 160", format: "120", url: "https://www.yoursdurham.com/shopping/p/kodak-portra-160-120" },
  { stock: "Kodak Portra 400", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/kodak-portra-400-35mm" },
  { stock: "Kodak Portra 400", format: "120", url: "https://www.yoursdurham.com/shopping/p/kodak-portra-400-120" },
  { stock: "Kodak Portra 800", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/kodak-portra-800-35mm" },
  { stock: "Kodak Portra 800", format: "120", url: "https://www.yoursdurham.com/shopping/p/kodak-portra-800-120" },
  { stock: "Kodak Gold 200", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/kodak-gold-200-35mm" },
  { stock: "Kodak Gold 200", format: "120", url: "https://www.yoursdurham.com/shopping/p/kodak-gold-200-120" },
  { stock: "Kodak UltraMax 400", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/kodak-ultramax-400-35mm" },
  { stock: "Kodak ColorPlus 200", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/kodak-colorplus-200-35mm" },
  { stock: "Kodak Kodacolor 200", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/kodak-kodacolor-200" },
  { stock: "Kodak Ektar 100", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/kodak-ektar-100-35m" },
  { stock: "Kodak Ektar 100", format: "120", url: "https://www.yoursdurham.com/shopping/p/kodak-ektar-100-120" },
  { stock: "Kodak T-Max 400", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/kodak-400-tmax-35mm" },
  { stock: "Kodak T-Max 400", format: "120", url: "https://www.yoursdurham.com/shopping/p/kodak-400-tmax" },
  { stock: "Kodak T-Max P3200", format: "35mm", url: TMAX_P3200_35 },
  { stock: "Kodak Tri-X 400", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/kodak-400-tri-x-35mm" },
  { stock: "Kodak Tri-X 400", format: "120", url: "https://www.yoursdurham.com/shopping/p/kodak-400tx-120" },
  { stock: "Ilford HP5 Plus 400", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/ilford-hp5-plus-400" },
  { stock: "Cinestill 800T", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/cinestill-800t-35mm" },
  { stock: "Cinestill 800T", format: "120", url: "https://www.yoursdurham.com/shopping/p/cinestill-800t-120" },
  { stock: "Cinestill 400D", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/cinestill-400d-35mm" },
  { stock: "Cinestill 400D", format: "120", url: "https://www.yoursdurham.com/shopping/p/cinestill-400d-120" },
  { stock: "Lomography Color 400", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/lomography-color-negative-400-35mm-3-pack-36-exp" },
  { stock: "Lomography LomoChrome Metropolis", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/lomography-lomochrome-metropolis-35mm-xr-100400-36-exp" },
  { stock: "Fujifilm Superia 200", format: "35mm", url: FUJI_200_35 },
  { stock: "Fujifilm Superia 400", format: "35mm", url: FUJI_400_35 },
  { stock: "Candido 400", format: "35mm", url: CANDIDO_400_35 },
  { stock: "Candido 800", format: "35mm", url: CANDIDO_800_35 },
  { stock: "Phoenix 125", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/harman-phoenix-125-35mm" },
  { stock: "Phoenix 125", format: "120", url: "https://www.yoursdurham.com/shopping/p/harman-phoenix-125-120" },
  { stock: "Phoenix 200 - Blue", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/harman-phoenix-ii-200" },
  { stock: "Phoenix 200 - Blue", format: "120", url: "https://www.yoursdurham.com/shopping/p/harman-phoenix-ii-200-color-120" },
  { stock: "Harman Azure 125", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/harman-switch-azure-125-35mm" },
  { stock: "Harman Azure 125", format: "120", url: "https://www.yoursdurham.com/shopping/p/harman-switch-azure-125" },
];

function compactFilmStock(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripFilmBrand(compacted: string): string {
  return compacted.replace(/^(kodak|fujifilm|fuji|ilford|cinestill|lomography|harman)/, "");
}

function normalizeFormat(format: string | null | undefined): FilmShopFormat | null {
  if (typeof format !== "string") return null;
  const compact = format.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (compact === "35mm") return "35mm";
  if (compact === "120") return "120";
  return null;
}

function isDisposableFormat(format: string | null | undefined): boolean {
  if (typeof format !== "string") return false;
  const compact = format.toLowerCase().replace(/[^a-z0-9]/g, "");
  return compact === "disposable" || compact === "disposablecamera";
}

function isDisposableStock(stock: string | null | undefined): boolean {
  if (typeof stock !== "string") return false;
  const compact = compactFilmStock(stock);
  return compact.includes("funsaver") || compact.includes("disposable");
}

const FILM_PRODUCT_URL_BY_KEY = new Map<string, string>();

function linkKey(format: FilmShopFormat, compact: string): string {
  return `${format}|${compact}`;
}

const bareKeyCounts = new Map<string, number>();
for (const link of FILM_PRODUCT_LINKS) {
  const bare = stripFilmBrand(compactFilmStock(link.stock));
  if (bare.length < 3) continue;
  const key = linkKey(link.format, bare);
  bareKeyCounts.set(key, (bareKeyCounts.get(key) ?? 0) + 1);
}

for (const link of FILM_PRODUCT_LINKS) {
  const full = compactFilmStock(link.stock);
  const bare = stripFilmBrand(full);
  FILM_PRODUCT_URL_BY_KEY.set(linkKey(link.format, full), link.url);
  const bareKey = linkKey(link.format, bare);
  if (
    bare.length >= 3
    && bare !== full
    && bareKeyCounts.get(bareKey) === 1
    && !FILM_PRODUCT_URL_BY_KEY.has(bareKey)
  ) {
    FILM_PRODUCT_URL_BY_KEY.set(bareKey, link.url);
  }
}

/** Shop titles and shorthand that do not compact to the catalog stock string. */
const EXTRA_COMPACT_KEYS: readonly { format: FilmShopFormat; compact: string; url: string }[] = [
  { format: "35mm", compact: "fujifilm200", url: FUJI_200_35 },
  { format: "35mm", compact: "fuji200", url: FUJI_200_35 },
  { format: "35mm", compact: "fujifilm400", url: FUJI_400_35 },
  { format: "35mm", compact: "fuji400", url: FUJI_400_35 },
  { format: "35mm", compact: "kodaktmax3200", url: TMAX_P3200_35 },
  { format: "35mm", compact: "kodakp3200", url: TMAX_P3200_35 },
  { format: "35mm", compact: "kodakp3200tmax", url: TMAX_P3200_35 },
  { format: "35mm", compact: "tmax3200", url: TMAX_P3200_35 },
  { format: "35mm", compact: "p3200", url: TMAX_P3200_35 },
  { format: "35mm", compact: "candido400colourfilm", url: CANDIDO_400_35 },
  { format: "35mm", compact: "candido800colourfilm", url: CANDIDO_800_35 },
  { format: "35mm", compact: "harmanazure", url: "https://www.yoursdurham.com/shopping/p/harman-switch-azure-125-35mm" },
  { format: "120", compact: "harmanazure", url: "https://www.yoursdurham.com/shopping/p/harman-switch-azure-125" },
  { format: "35mm", compact: "switchazure", url: "https://www.yoursdurham.com/shopping/p/harman-switch-azure-125-35mm" },
  { format: "120", compact: "switchazure", url: "https://www.yoursdurham.com/shopping/p/harman-switch-azure-125" },
  { format: "35mm", compact: "harmanswitchazure", url: "https://www.yoursdurham.com/shopping/p/harman-switch-azure-125-35mm" },
  { format: "120", compact: "harmanswitchazure", url: "https://www.yoursdurham.com/shopping/p/harman-switch-azure-125" },
  { format: "35mm", compact: "switchazure125", url: "https://www.yoursdurham.com/shopping/p/harman-switch-azure-125-35mm" },
  { format: "120", compact: "switchazure125", url: "https://www.yoursdurham.com/shopping/p/harman-switch-azure-125" },
];

for (const extra of EXTRA_COMPACT_KEYS) {
  const key = linkKey(extra.format, extra.compact);
  if (!FILM_PRODUCT_URL_BY_KEY.has(key)) {
    FILM_PRODUCT_URL_BY_KEY.set(key, extra.url);
  }
}

/** Absolute shop URL for a film stock pill, or null when it should stay plain text. */
export function filmProductUrl(
  stock: string | null | undefined,
  format?: string | null,
): string | null {
  if (isDisposableFormat(format) || isDisposableStock(stock)) {
    return KODAK_FUNSAVER_URL;
  }
  const shopFormat = normalizeFormat(format);
  if (!shopFormat || typeof stock !== "string") return null;
  const full = compactFilmStock(correctFilmStockSpelling(stock));
  if (full.length < 3) return null;
  const direct = FILM_PRODUCT_URL_BY_KEY.get(linkKey(shopFormat, full));
  if (direct) return direct;
  const bare = stripFilmBrand(full);
  if (bare.length < 3 || bare === full) return null;
  return FILM_PRODUCT_URL_BY_KEY.get(linkKey(shopFormat, bare)) ?? null;
}
