/**
 * Turns a customer's free-text film list into catalog stocks for each roll.
 * A close unique name is a match with a 0–100 confidence score. A weak or
 * ambiguous name becomes a new stock, and the original wording is kept.
 * No database or email side effects.
 */

import { isDisposableCameraLabel, isDisposableFilmType, withoutDisposableFilmStock } from "./disposable-roll";
import { correctFilmStockSpelling, FILM_STOCKS } from "./film-stocks";

export const CUSTOMER_FILM_NOTE_PREFIX = "Customer listed film:";
/** Unique catalog matches at or above this score are used. Below it, the written name is a new stock. */
export const FILM_STOCK_MATCH_THRESHOLD = 72;
const AMBIGUITY_GAP = 12;
const MAX_LISTED_QUANTITY = 20;
const MAX_NEW_STOCK_LENGTH = 80;

export interface FilmStockScore {
  raw: string;
  /** Catalog name, the new stock text, or null when the text is not a stock name. */
  stock: string | null;
  /** 0–100. For a new stock this is the closest catalog score that was rejected. */
  confidence: number;
  /** True when the written name was kept because no catalog stock was close enough. */
  created: boolean;
}

export interface ParsedFilmToken {
  raw: string;
  /** Catalog name, new stock text, or null when this piece is not a stock. */
  stock: string | null;
  count: number;
  confidence: number;
  created: boolean;
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripLeadingBrand(compacted: string): string {
  return compacted.replace(/^(kodak|fujifilm|fuji|ilford|cinestill|lomography|lomo|harman)/, "");
}

/** Spelling and brand-line aliases that should compare as the same name. */
function canonicalName(compacted: string): string {
  return compacted
    .replace(/reflxlabs/g, "reflx")
    .replace(/reflxlab/g, "reflx")
    .replace(/reflex/g, "reflx")
    .replace(/hp5plus/g, "hp5");
}

function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = new Array<number>(right.length + 1);
  const current = new Array<number>(right.length + 1);
  for (let column = 0; column <= right.length; column += 1) previous[column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost,
      );
    }
    for (let column = 0; column <= right.length; column += 1) previous[column] = current[column];
  }
  return previous[right.length];
}

interface SpeedParts {
  name: string;
  speed: string | null;
}

function splitSpeed(compacted: string): SpeedParts {
  const match = compacted.match(/(\d{2,4})([td])?/);
  if (!match || match.index === undefined) return { name: compacted, speed: null };
  return {
    name: `${compacted.slice(0, match.index)}${compacted.slice(match.index + match[0].length)}`,
    speed: match[0],
  };
}

function speedsCompatible(querySpeed: string | null, stockSpeed: string | null): boolean {
  if (!querySpeed) return true;
  if (!stockSpeed) return false;
  const queryNumber = querySpeed.match(/^\d+/)?.[0] ?? "";
  const stockNumber = stockSpeed.match(/^\d+/)?.[0] ?? "";
  if (!queryNumber || queryNumber !== stockNumber) return false;
  const querySuffix = querySpeed.slice(queryNumber.length);
  const stockSuffix = stockSpeed.slice(stockNumber.length);
  if (querySuffix && stockSuffix && querySuffix !== stockSuffix) return false;
  return true;
}

function nameScore(queryName: string, stockName: string, queryCompact: string, stockCompact: string): number {
  const query = canonicalName(queryName);
  const stock = canonicalName(stockName);
  if (!query && !stock) return 100;
  if (!query) return 58;
  if (query === stock) return 100;
  if ((stock.startsWith(query) || query.startsWith(stock)) && Math.min(query.length, stock.length) >= 3) {
    return 90;
  }
  if (query.length >= 4 && stock.includes(query)) return 84;
  if (queryCompact.length >= 4 && (stockCompact.includes(queryCompact) || queryCompact.includes(stockCompact))) {
    return 86;
  }
  const distance = levenshtein(query, stock);
  return Math.round((1 - distance / Math.max(query.length, stock.length)) * 100);
}

function stockScore(queryCompact: string, stock: string): number {
  const full = compact(stock);
  const bare = stripLeadingBrand(full);
  const queryBare = stripLeadingBrand(queryCompact);
  const queryParts = splitSpeed(queryBare.length >= 3 ? queryBare : queryCompact);
  const stockParts = splitSpeed(bare);
  if (!speedsCompatible(queryParts.speed, stockParts.speed)) return 0;
  return nameScore(queryParts.name, stockParts.name, queryCompact, full);
}

function newStockText(raw: string): string | null {
  const cleaned = correctFilmStockSpelling(raw.trim().replace(/\s+/g, " "));
  if (!cleaned || cleaned.length > MAX_NEW_STOCK_LENGTH) return null;
  if (cleaned.split(/\s+/).length > 6) return null;
  if (!/[a-z]/i.test(cleaned)) return null;
  return cleaned;
}

/**
 * Scores one written stock against the dropdown list.
 * Ambiguous names (portra, tmax) are not guessed. They come back as a new stock.
 */
export function scoreFilmStock(
  query: string,
  catalog: readonly string[] = FILM_STOCKS,
): FilmStockScore {
  const raw = query.trim();
  const trimmed = correctFilmStockSpelling(raw);
  if (!/[a-z]/i.test(trimmed)) {
    return { raw, stock: null, confidence: 0, created: false };
  }
  const queryCompact = compact(trimmed);
  if (queryCompact.length < 3) {
    return { raw, stock: null, confidence: 0, created: false };
  }

  const ranked = catalog
    .map((stock) => ({ stock, score: stockScore(queryCompact, stock) }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || left.stock.localeCompare(right.stock));

  const best = ranked[0];
  const runnerUp = ranked[1];
  const ambiguous = Boolean(
    best
    && runnerUp
    && best.score >= FILM_STOCK_MATCH_THRESHOLD
    && runnerUp.score >= FILM_STOCK_MATCH_THRESHOLD
    && best.score - runnerUp.score < AMBIGUITY_GAP,
  );
  if (best && best.score >= FILM_STOCK_MATCH_THRESHOLD && !ambiguous) {
    return { raw, stock: best.stock, confidence: best.score, created: false };
  }

  const created = newStockText(raw);
  return {
    raw,
    stock: created,
    confidence: best?.score ?? 0,
    created: created !== null,
  };
}

/**
 * Catalog match only. Returns null when the name is ambiguous, weak, or new.
 * Callers that should keep a new stock use scoreFilmStock.
 */
export function matchFilmStock(
  query: string,
  catalog: readonly string[] = FILM_STOCKS,
): string | null {
  const scored = scoreFilmStock(query, catalog);
  if (scored.created || !scored.stock) return null;
  return scored.stock;
}

/** Commas, newlines, " and ", "&", and "+" separate listed stocks. */
export function splitFilmListing(text: string): string[] {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\s*(?:,|\n)\s*(?:and\s+)?/gi, "\n")
    .replace(/\s+and\s+/gi, "\n")
    .replace(/\s*&\s*/g, "\n")
    .replace(/\s*\+\s*/g, "\n");
  return normalized
    .split("\n")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function listedQuantity(part: string): { name: string; count: number } | null {
  const leading = part.match(/^(\d{1,2})\s*x\s*(.+)$/i);
  if (leading) {
    const count = Number(leading[1]);
    const name = leading[2].trim();
    if (count >= 1 && count <= MAX_LISTED_QUANTITY && /[a-z]/i.test(name)) {
      return { name, count };
    }
  }
  const trailing = part.match(/^(.+?)\s*x\s*(\d{1,2})$/i);
  if (trailing) {
    const count = Number(trailing[2]);
    const name = trailing[1].trim();
    if (count >= 1 && count <= MAX_LISTED_QUANTITY && /[a-z]/i.test(name)) {
      return { name, count };
    }
  }
  return null;
}

export function parseFilmListing(
  text: string,
  catalog: readonly string[] = FILM_STOCKS,
): ParsedFilmToken[] {
  return splitFilmListing(text).map((part) => {
    const quantity = listedQuantity(part);
    const name = quantity?.name ?? part;
    const scored = scoreFilmStock(name, catalog);
    return {
      raw: part,
      count: quantity?.count ?? 1,
      stock: scored.stock,
      confidence: scored.confidence,
      created: scored.created,
    };
  });
}

export function customerFilmNote(listing: string): string {
  return `${CUSTOMER_FILM_NOTE_PREFIX} ${listing.trim()}`;
}

export function mergeCustomerFilmNote(
  existing: string | null | undefined,
  note: string | null | undefined,
): string | null {
  const addition = note?.trim() ?? "";
  const current = existing?.trim() ?? "";
  if (!addition) return current || null;
  if (!current) return addition;
  if (current.toLowerCase().includes(addition.toLowerCase())) return current;
  return `${current}\n${addition}`;
}

export function formatStockMatchLabel(roll: {
  film_stock_confidence?: number;
  film_stock_created?: boolean;
}): string | null {
  if (roll.film_stock_created) return "new stock";
  if (typeof roll.film_stock_confidence !== "number" || !Number.isFinite(roll.film_stock_confidence)) {
    return null;
  }
  return `${Math.round(roll.film_stock_confidence)}% match`;
}

/** Drops matcher fields before a roll is saved on a film order. */
export function stripRollStockMatch<T extends {
  film_stock_confidence?: number;
  film_stock_created?: boolean;
}>(roll: T): Omit<T, "film_stock_confidence" | "film_stock_created"> {
  const rest = { ...roll };
  delete rest.film_stock_confidence;
  delete rest.film_stock_created;
  return rest;
}

function assignStock<T extends { film_stock?: string; film_type?: string }>(
  roll: T,
  token: ParsedFilmToken,
): T & { film_stock_confidence?: number; film_stock_created?: boolean } {
  if (isDisposableFilmType(roll.film_type)) return withoutDisposableFilmStock(roll);
  if (!token.stock || roll.film_stock?.trim()) return roll;
  return {
    ...roll,
    film_stock: token.stock,
    film_stock_confidence: token.confidence,
    ...(token.created ? { film_stock_created: true as const } : {}),
  };
}

/**
 * Assigns parsed stocks onto rolls that do not already have one.
 * A single stock with no quantity ("Portra 400") fills every remaining roll.
 * An explicit quantity ("2x Portra 400") or a list of stocks fills in order
 * and leaves extra rolls blank.
 * Disposable Camera rolls are skipped. "Disposable" is the stock for those.
 * A disposable label in the listing (FunSaver, single-use) is not a stock.
 * The original listing is always returned as a note, matched or not.
 * A name that is not close to one catalog stock is stored as a new stock.
 */
export function applyFilmListingToRolls<T extends { film_stock?: string; film_type?: string }>(
  rolls: readonly T[],
  listing: string | null | undefined,
  catalog: readonly string[] = FILM_STOCKS,
): {
  rolls: Array<T & { film_stock_confidence?: number; film_stock_created?: boolean }>;
  unmatchedNote: string | null;
} {
  const next = rolls.map((roll) => withoutDisposableFilmStock({ ...roll }));
  const text = listing?.trim() ?? "";
  if (!text || next.length === 0) {
    return { rolls: next, unmatchedNote: null };
  }

  const tokens = parseFilmListing(text, catalog)
    .filter((token) => !isDisposableCameraLabel(token.raw));
  const originalNote = customerFilmNote(text);
  if (tokens.length === 0) {
    return { rolls: next, unmatchedNote: originalNote };
  }

  const singleStock = tokens.length === 1 && tokens[0].count === 1 && tokens[0].stock
    ? tokens[0]
    : null;

  if (singleStock) {
    return {
      rolls: next.map((roll) => assignStock(roll, singleStock)),
      unmatchedNote: originalNote,
    };
  }

  let index = 0;
  for (const token of tokens) {
    const copies = Math.max(token.count, 1);
    for (let copy = 0; copy < copies && index < next.length; copy += 1) {
      while (index < next.length && isDisposableFilmType(next[index].film_type)) index += 1;
      if (index >= next.length) break;
      next[index] = assignStock(next[index], token);
      index += 1;
    }
  }
  return { rolls: next, unmatchedNote: originalNote };
}
