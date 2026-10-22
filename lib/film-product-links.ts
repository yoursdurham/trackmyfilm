/**
 * Product pages for the drop-off catalog in lib/film-stocks.ts.
 * Collected from the public Squarespace film collections
 * (shopping/35mm-film, shopping/120-film, shopping/110-film) via ?format=json.
 * Keys are the catalog names. Lookup ignores case, spacing, and punctuation, and a
 * leading Kodak / Fujifilm / Ilford / Cinestill / Lomography prefix. Anything that
 * does not equal one sold stock after that stays unlinked.
 * When the shop sells the same stock in 35mm and 120, this uses the 35mm single-roll page.
 * A multipack is used only when that is the only product for the stock.
 */
export const FILM_PRODUCT_LINKS: Readonly<Record<string, string>> = {
  "Kodak Portra 160": "https://www.yoursdurham.com/shopping/p/kodak-portra-160-35mm",
  "Kodak Portra 400": "https://www.yoursdurham.com/shopping/p/kodak-portra-400-35mm",
  "Kodak Portra 800": "https://www.yoursdurham.com/shopping/p/kodak-portra-800-35mm",
  "Kodak Gold 200": "https://www.yoursdurham.com/shopping/p/kodak-gold-200-35mm",
  "Kodak UltraMax 400": "https://www.yoursdurham.com/shopping/p/kodak-ultramax-400-35mm",
  "Kodak ColorPlus 200": "https://www.yoursdurham.com/shopping/p/kodak-colorplus-200-35mm",
  "Kodak Ektar 100": "https://www.yoursdurham.com/shopping/p/kodak-ektar-100-35m",
  "Kodak T-Max 400": "https://www.yoursdurham.com/shopping/p/kodak-400-tmax-35mm",
  "Kodak Tri-X 400": "https://www.yoursdurham.com/shopping/p/kodak-400-tri-x-35mm",
  "Ilford HP5 Plus 400": "https://www.yoursdurham.com/shopping/p/ilford-hp5-plus-400",
  "Cinestill 800T": "https://www.yoursdurham.com/shopping/p/cinestill-800t-35mm",
  "Cinestill 400D": "https://www.yoursdurham.com/shopping/p/cinestill-400d-35mm",
  "Lomography Color 400": "https://www.yoursdurham.com/shopping/p/lomography-color-negative-400-35mm-3-pack-36-exp",
};

function compactFilmStock(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripFilmBrand(compacted: string): string {
  return compacted.replace(/^(kodak|fujifilm|fuji|ilford|cinestill|lomography)/, "");
}

const FILM_PRODUCT_URL_BY_KEY = new Map<string, string>();

const bareKeyCounts = new Map<string, number>();
for (const name of Object.keys(FILM_PRODUCT_LINKS)) {
  const bare = stripFilmBrand(compactFilmStock(name));
  if (bare.length >= 3) bareKeyCounts.set(bare, (bareKeyCounts.get(bare) ?? 0) + 1);
}

for (const [name, url] of Object.entries(FILM_PRODUCT_LINKS)) {
  const full = compactFilmStock(name);
  const bare = stripFilmBrand(full);
  FILM_PRODUCT_URL_BY_KEY.set(full, url);
  if (bare.length >= 3 && bare !== full && bareKeyCounts.get(bare) === 1 && !FILM_PRODUCT_URL_BY_KEY.has(bare)) {
    FILM_PRODUCT_URL_BY_KEY.set(bare, url);
  }
}

/** Absolute shop URL for a film stock pill, or null when it should stay plain text. */
export function filmProductUrl(stock: string | null | undefined): string | null {
  if (typeof stock !== "string") return null;
  const full = compactFilmStock(stock);
  if (full.length < 3) return null;
  const direct = FILM_PRODUCT_URL_BY_KEY.get(full);
  if (direct) return direct;
  const bare = stripFilmBrand(full);
  if (bare.length < 3 || bare === full) return null;
  return FILM_PRODUCT_URL_BY_KEY.get(bare) ?? null;
}
