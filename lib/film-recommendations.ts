import { filmProductUrl, type FilmShopFormat } from "@/lib/film-product-links";
import {
  FILM_RECOMMENDATION_BLURBS,
  type FilmRecommendationBlurb,
} from "@/lib/film-recommendation-blurbs";
import { correctFilmStockSpelling } from "@/lib/film-stocks";

const RECOMMENDATION_COUNT = 3;

/** Shown when this customer has no recognized rolls yet. */
const DEFAULT_STOCKS = ["Kodak Gold 200", "Kodak Portra 400", "Ilford HP5 Plus 400"] as const;

export type ShotRoll = {
  stock: string;
  format?: string | null;
};

export type FilmRecommendation = {
  stock: string;
  format: FilmShopFormat;
  href: string;
  blurb: string;
};

type Ranked = FilmRecommendationBlurb & { index: number };

const CATALOG: Ranked[] = FILM_RECOMMENDATION_BLURBS.map((blurb, index) => ({ ...blurb, index }));

function compactStock(stock: string): string {
  return correctFilmStockSpelling(stock).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function shopFormats(stock: string): FilmShopFormat[] {
  return (["35mm", "120"] as const).filter((format) => filmProductUrl(stock, format));
}

function rollUrls(roll: ShotRoll): string[] {
  const formats = roll.format ? [roll.format] : ["35mm", "120"];
  const urls: string[] = [];
  for (const format of formats) {
    const url = filmProductUrl(roll.stock, format);
    if (url) urls.push(url);
  }
  return urls;
}

function linked(stock: string, format: FilmShopFormat): string | null {
  return filmProductUrl(stock, format);
}

function chooseLink(blurb: FilmRecommendationBlurb, preferred: FilmShopFormat | null): { format: FilmShopFormat; href: string } | null {
  const formats: FilmShopFormat[] = [];
  if (preferred) formats.push(preferred);
  formats.push(blurb.format, "35mm", "120");
  const seen = new Set<FilmShopFormat>();
  for (const format of formats) {
    if (seen.has(format)) continue;
    seen.add(format);
    const href = linked(blurb.stock, format);
    if (href) return { format, href };
  }
  return null;
}

function toRecommendation(blurb: FilmRecommendationBlurb, preferred: FilmShopFormat | null): FilmRecommendation | null {
  const link = chooseLink(blurb, preferred);
  if (!link) return null;
  return { stock: blurb.stock, format: link.format, href: link.href, blurb: blurb.blurb };
}

function preferredFormat(rolls: ShotRoll[]): FilmShopFormat | null {
  const counts = new Map<FilmShopFormat, number>();
  for (const roll of rolls) {
    const format = roll.format?.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (format === "35mm" || format === "120") {
      counts.set(format, (counts.get(format) ?? 0) + 1);
    }
  }
  const mm = counts.get("35mm") ?? 0;
  const medium = counts.get("120") ?? 0;
  if (mm === medium) return null;
  return mm > medium ? "35mm" : "120";
}

function alreadyShot(blurb: FilmRecommendationBlurb, shotNames: Set<string>, shotUrls: Set<string>): boolean {
  if (shotNames.has(compactStock(blurb.stock))) return true;
  return shopFormats(blurb.stock).some((format) => {
    const url = linked(blurb.stock, format);
    return Boolean(url && shotUrls.has(url));
  });
}

function isoBucket(iso: number, preferredIso: number): number {
  const distance = Math.abs(iso - preferredIso);
  if (distance <= 200) return 0;
  if (distance <= 400) return 1;
  return 2;
}

/**
 * Two or three shop films this customer has not shot.
 * Color history stays in color. Black and white history stays in black and white.
 * Someone with no recognized rolls gets the curated default set.
 * Links come from the format-matched shop map, preferring the format they shoot.
 */
export function recommendNewFilms(rolls: ShotRoll[]): FilmRecommendation[] {
  const shotNames = new Set<string>();
  const shotUrls = new Set<string>();
  for (const roll of rolls) {
    const name = compactStock(roll.stock);
    if (name) shotNames.add(name);
    for (const url of rollUrls(roll)) shotUrls.add(url);
  }

  const available = CATALOG.filter((blurb) => !alreadyShot(blurb, shotNames, shotUrls));
  const format = preferredFormat(rolls);
  const take = (blurbs: Ranked[]) => blurbs
    .map((blurb) => toRecommendation(blurb, format))
    .filter((item): item is FilmRecommendation => Boolean(item))
    .slice(0, RECOMMENDATION_COUNT);

  const colorRolls = rolls.filter((roll) => matchingLook(roll, "color"));
  const bwRolls = rolls.filter((roll) => matchingLook(roll, "black-and-white"));
  if (colorRolls.length === 0 && bwRolls.length === 0) {
    const defaults = DEFAULT_STOCKS
      .map((stock) => available.find((blurb) => blurb.stock === stock))
      .filter((blurb): blurb is Ranked => Boolean(blurb));
    const rest = available.filter((blurb) => !defaults.includes(blurb));
    return take([...defaults, ...rest]);
  }

  const look = colorRolls.length === bwRolls.length
    ? null
    : colorRolls.length > bwRolls.length ? "color" : "black-and-white";
  if (!look) {
    const color = available.filter((blurb) => blurb.look === "color");
    const bw = available.filter((blurb) => blurb.look === "black-and-white");
    const mixed: Ranked[] = [];
    const longest = Math.max(color.length, bw.length);
    for (let index = 0; index < longest && mixed.length < RECOMMENDATION_COUNT; index += 1) {
      if (color[index]) mixed.push(color[index]);
      if (mixed.length < RECOMMENDATION_COUNT && bw[index]) mixed.push(bw[index]);
    }
    return take(mixed);
  }

  const history = look === "color" ? colorRolls : bwRolls;
  const preferredIso = dominantIso(history);
  const ranked = available
    .filter((blurb) => blurb.look === look)
    .sort((left, right) => {
      const bucket = isoBucket(left.iso, preferredIso) - isoBucket(right.iso, preferredIso);
      if (bucket !== 0) return bucket;
      return left.index - right.index;
    });
  if (ranked.length >= 2) return take(ranked);
  const other = available.filter((blurb) => blurb.look !== look);
  return take([...ranked, ...other]);
}

function matchingLook(roll: ShotRoll, look: FilmRecommendationBlurb["look"]): boolean {
  const name = compactStock(roll.stock);
  if (CATALOG.some((blurb) => blurb.look === look && compactStock(blurb.stock) === name)) return true;
  const urls = new Set(rollUrls(roll));
  return CATALOG.some((blurb) => blurb.look === look && shopFormats(blurb.stock).some((format) => {
    const url = linked(blurb.stock, format);
    return Boolean(url && urls.has(url));
  }));
}

function dominantIso(rolls: ShotRoll[]): number {
  const counts = new Map<number, number>();
  for (const roll of rolls) {
    const name = compactStock(roll.stock);
    const match = CATALOG.find((blurb) => compactStock(blurb.stock) === name)
      ?? CATALOG.find((blurb) => {
        const urls = new Set(rollUrls(roll));
        return shopFormats(blurb.stock).some((format) => {
          const url = linked(blurb.stock, format);
          return Boolean(url && urls.has(url));
        });
      });
    if (!match) continue;
    counts.set(match.iso, (counts.get(match.iso) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0]);
  return ranked[0]?.[0] ?? 400;
}
