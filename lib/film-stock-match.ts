/**
 * Turns a customer's free-text film list into catalog stocks for each roll.
 * No database or email side effects.
 */

import { correctFilmStockSpelling, FILM_STOCKS } from "./film-stocks";

export const CUSTOMER_FILM_NOTE_PREFIX = "Customer listed film:";
const MAX_LISTED_QUANTITY = 20;

export interface ParsedFilmToken {
  raw: string;
  /** Catalog name when the text matches one stock. Null when it does not. */
  stock: string | null;
  count: number;
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripLeadingBrand(compacted: string): string {
  return compacted.replace(/^(kodak|fujifilm|fuji|ilford|cinestill|lomography|harman)/, "");
}

/**
 * Case- and spacing-insensitive match. "ultramax" and "ultra max" both
 * resolve to Kodak UltraMax 400. Ambiguous names ("portra", "tmax") do not
 * guess between speeds.
 */
export function matchFilmStock(
  query: string,
  catalog: readonly string[] = FILM_STOCKS,
): string | null {
  const trimmed = correctFilmStockSpelling(query.trim());
  if (!/[a-z]/i.test(trimmed)) return null;
  const q = compact(trimmed);
  if (q.length < 3) return null;
  const qBare = stripLeadingBrand(q);
  const needle = qBare.length >= 3 ? qBare : q;

  const ranked = catalog.map((stock) => {
    const full = compact(stock);
    const bare = stripLeadingBrand(full);
    let score = 0;
    if (full === q || bare === needle || full === needle) score = 100;
    else if (bare.startsWith(needle) || (needle.startsWith(bare) && bare.length >= 4)) score = 80;
    else if (needle.length >= 4 && (full.includes(needle) || bare.includes(needle))) score = 70;
    else if (bare.length >= 4 && needle.includes(bare)) score = 60;
    return { stock, score, full };
  }).filter((row) => row.score > 0);

  if (ranked.length === 0) return null;
  const best = Math.max(...ranked.map((row) => row.score));
  let winners = ranked.filter((row) => row.score === best);

  const numbers = trimmed.match(/\d{2,4}/g) ?? [];
  if (winners.length > 1 && numbers.length > 0) {
    const narrowed = winners.filter((row) => numbers.every((number) => row.full.includes(number)));
    if (narrowed.length >= 1) winners = narrowed;
  }

  if (winners.length === 1) return winners[0].stock;
  return null;
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
    return {
      raw: part,
      count: quantity?.count ?? 1,
      stock: matchFilmStock(name, catalog),
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

/**
 * Assigns parsed stocks onto rolls that do not already have one.
 * A single stock with no quantity ("Portra 400") fills every remaining roll.
 * An explicit quantity ("2x Portra 400") or a list of stocks fills in order
 * and leaves extra rolls blank.
 * When any listed name does not match, the raw text is returned as a note.
 */
export function applyFilmListingToRolls<T extends { film_stock?: string }>(
  rolls: readonly T[],
  listing: string | null | undefined,
  catalog: readonly string[] = FILM_STOCKS,
): { rolls: T[]; unmatchedNote: string | null } {
  const next = rolls.map((roll) => ({ ...roll }));
  const text = listing?.trim() ?? "";
  if (!text || next.length === 0) {
    return { rolls: next, unmatchedNote: null };
  }

  const tokens = parseFilmListing(text, catalog);
  if (tokens.length === 0) {
    return { rolls: next, unmatchedNote: customerFilmNote(text) };
  }

  const unmatchedNote = tokens.some((token) => token.stock === null)
    ? customerFilmNote(text)
    : null;
  const singleStock = tokens.length === 1 && tokens[0].count === 1 && tokens[0].stock
    ? tokens[0].stock
    : null;

  if (singleStock) {
    for (const roll of next) {
      if (!roll.film_stock?.trim()) roll.film_stock = singleStock;
    }
    return { rolls: next, unmatchedNote };
  }

  let index = 0;
  for (const token of tokens) {
    const copies = Math.max(token.count, 1);
    for (let copy = 0; copy < copies && index < next.length; copy += 1) {
      if (token.stock && !next[index].film_stock?.trim()) {
        next[index].film_stock = token.stock;
      }
      index += 1;
    }
  }
  return { rolls: next, unmatchedNote };
}
