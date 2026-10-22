/**
 * Product pages for the drop-off catalog in lib/film-stocks.ts.
 * Collected from the public Squarespace film collections
 * (shopping/35mm-film and shopping/120-film) via ?format=json.
 * Each entry is one catalog stock in one format. Lookup ignores case, spacing,
 * and punctuation, and a leading Kodak / Fujifilm / Ilford / Cinestill / Lomography
 * prefix. A roll links only when that stock is sold in that roll's format.
 * Format comes from the product title or URL, except Kodak 400 TMax, which the
 * shop confirmed is the 120 T-Max 400 page. A multipack is used only when it is
 * the only product for that stock and format. Lomography Color 400 is the 35mm 3-pack.
 */
export type FilmShopFormat = "35mm" | "120";

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
  { stock: "Kodak Ektar 100", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/kodak-ektar-100-35m" },
  { stock: "Kodak Ektar 100", format: "120", url: "https://www.yoursdurham.com/shopping/p/kodak-ektar-100-120" },
  { stock: "Kodak T-Max 400", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/kodak-400-tmax-35mm" },
  { stock: "Kodak T-Max 400", format: "120", url: "https://www.yoursdurham.com/shopping/p/kodak-400-tmax" },
  { stock: "Kodak Tri-X 400", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/kodak-400-tri-x-35mm" },
  { stock: "Kodak Tri-X 400", format: "120", url: "https://www.yoursdurham.com/shopping/p/kodak-400tx-120" },
  { stock: "Ilford HP5 Plus 400", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/ilford-hp5-plus-400" },
  { stock: "Cinestill 800T", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/cinestill-800t-35mm" },
  { stock: "Cinestill 800T", format: "120", url: "https://www.yoursdurham.com/shopping/p/cinestill-800t-120" },
  { stock: "Cinestill 400D", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/cinestill-400d-35mm" },
  { stock: "Cinestill 400D", format: "120", url: "https://www.yoursdurham.com/shopping/p/cinestill-400d-120" },
  { stock: "Lomography Color 400", format: "35mm", url: "https://www.yoursdurham.com/shopping/p/lomography-color-negative-400-35mm-3-pack-36-exp" },
];

function compactFilmStock(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripFilmBrand(compacted: string): string {
  return compacted.replace(/^(kodak|fujifilm|fuji|ilford|cinestill|lomography)/, "");
}

function normalizeFormat(format: string | null | undefined): FilmShopFormat | null {
  if (typeof format !== "string") return null;
  const compact = format.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (compact === "35mm") return "35mm";
  if (compact === "120") return "120";
  return null;
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

/** Absolute shop URL for a film stock pill, or null when it should stay plain text. */
export function filmProductUrl(
  stock: string | null | undefined,
  format?: string | null,
): string | null {
  const shopFormat = normalizeFormat(format);
  if (!shopFormat || typeof stock !== "string") return null;
  const full = compactFilmStock(stock);
  if (full.length < 3) return null;
  const direct = FILM_PRODUCT_URL_BY_KEY.get(linkKey(shopFormat, full));
  if (direct) return direct;
  const bare = stripFilmBrand(full);
  if (bare.length < 3 || bare === full) return null;
  return FILM_PRODUCT_URL_BY_KEY.get(linkKey(shopFormat, bare)) ?? null;
}
