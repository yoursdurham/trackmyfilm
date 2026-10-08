/**
 * Pure business-logic helpers with no side-effects.
 * These are the source of truth for validation rules — API routes and tests both import from here.
 */

import { STATUS_FLOW } from "./constants";
import type { FilmType, OrderStatus, RollDetail } from "./types";

/** Staff-selectable film formats for new drop-offs (excludes legacy-only types). */
export const DROP_OFF_FILM_TYPES = ["35mm", "120", "110"] as const satisfies readonly FilmType[];

/** All film types stored on orders and customer defaults. */
export const FILM_TYPES = ["35mm", "120", "110", "Disposable Camera"] as const satisfies readonly FilmType[];

const FILM_TYPE_SET = new Set<string>(FILM_TYPES);

/**
 * Coerces API/form values to a string film type (e.g. numeric 110 → "110").
 */
export function normalizeFilmType(value: unknown): FilmType | null {
  if (value === null || value === undefined) return null;
  const asString = typeof value === "number" ? String(value) : String(value).trim();
  if (!asString) return null;
  return FILM_TYPE_SET.has(asString) ? (asString as FilmType) : null;
}

export function isValidFilmType(value: unknown): value is FilmType {
  return normalizeFilmType(value) !== null;
}

export function validateRollDetails(roll_details: unknown): string | null {
  if (roll_details === undefined || roll_details === null) return null;
  if (!Array.isArray(roll_details)) return "roll_details must be an array";
  for (let i = 0; i < roll_details.length; i++) {
    const roll = roll_details[i] as Partial<RollDetail>;
    const filmType = normalizeFilmType(roll?.film_type);
    if (!filmType) {
      return `roll_details[${i}].film_type is invalid (expected one of: ${FILM_TYPES.join(", ")})`;
    }
    if (roll.film_process && !["Color", "Black & White", "Both"].includes(roll.film_process)) {
      return `roll_details[${i}].film_process is invalid`;
    }
  }
  return null;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Returns true only for valid forward transitions.
 * Backward transitions require `force: true` on the API call.
 */
export function isValidTransition(current: OrderStatus, next: OrderStatus): boolean {
  return STATUS_FLOW.indexOf(next) > STATUS_FLOW.indexOf(current);
}

/**
 * Returns true if a status is a known value in STATUS_FLOW.
 */
export function isKnownStatus(status: string): status is OrderStatus {
  return (STATUS_FLOW as string[]).includes(status);
}

/**
 * Returns true if the last email send for this template was within the dedup window (1 hour).
 */
export function isWithinDedupWindow(lastSentAt: string | undefined | null): boolean {
  if (!lastSentAt) return false;
  return Date.now() - new Date(lastSentAt).getTime() < ONE_HOUR_MS;
}

/**
 * Normalises a customer-facing name for dedup comparisons:
 * trim, collapse internal whitespace, lowercase.
 */
export function normalizeCustomerName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Normalises an email address: trim + lowercase.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Exact match on the trimmed, lowercased email. `%` and `_` are literal
 * characters, never LIKE wildcards.
 */
export function emailsMatchExact(
  stored: string | null | undefined,
  input: string | null | undefined
): boolean {
  const left = normalizeEmail(stored ?? "");
  const right = normalizeEmail(input ?? "");
  if (!left || !right) return false;
  return left === right;
}

/**
 * ILIKE pattern for one exact email. Backslash, `%`, and `_` are escaped so
 * the pattern cannot match a different address. Callers still confirm with
 * emailsMatchExact, which does not depend on the database escape rules.
 */
export function exactEmailIlikePattern(email: string): string {
  return normalizeEmail(email).replace(/[\\%_]/g, (char) => `\\${char}`);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns true for a non-empty, reasonably formatted email address.
 */
export function isValidEmail(email: string): boolean {
  const normalized = email.trim();
  if (!normalized) return false;
  return EMAIL_PATTERN.test(normalized);
}

/**
 * Storage form for an order number: trim + uppercase.
 * Leading zeros stay in the saved text. Squarespace "01050" is stored as "01050".
 * Comparisons use orderNumberMatchKey, which strips those zeros.
 */
export function normalizeOrderNumber(num: string): string {
  return num.trim().toUpperCase();
}

/**
 * Comparison key: trim, uppercase, strip leading zeros.
 * "01034", "1034", and "001034" share "1034". A value that is only zeros stays "0".
 * Letters and other non-numeric prefixes are left in place, so "ORD-001" stays
 * "ORD-001" and "JE01034" stays "JE01034". A blank value stays blank, not "0".
 */
export function orderNumberMatchKey(orderNumber: string): string {
  const normalized = normalizeOrderNumber(orderNumber);
  if (!normalized) return "";
  const stripped = normalized.replace(/^0+/, "");
  return stripped.length > 0 ? stripped : "0";
}

export function orderNumbersMatch(left: string, right: string): boolean {
  return orderNumberMatchKey(left) === orderNumberMatchKey(right);
}

/**
 * When several stored rows share a key, prefer the one whose saved text matches
 * the query (still keeping its leading zeros). Otherwise keep the first row,
 * which callers pass newest-first.
 */
export function preferStoredOrderNumber<T>(
  rows: readonly T[],
  query: string,
  readNumber: (row: T) => string,
): T | null {
  if (rows.length === 0) return null;
  const wanted = normalizeOrderNumber(query);
  return rows.find((row) => normalizeOrderNumber(readNumber(row)) === wanted) ?? rows[0];
}

/**
 * Staff search. A partial name or number still matches as a substring, and
 * "01034" matches a stored "1034" (and the other way around).
 */
export function orderNumberMatchesSearch(storedOrderNumber: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  if (storedOrderNumber.toLowerCase().includes(needle)) return true;
  return orderNumbersMatch(storedOrderNumber, query);
}

/**
 * Case-insensitive Postgres pattern (~*) for order numbers that differ only by leading zeros.
 * Blank queries match blank stored values only, never an order numbered "0".
 */
export function orderNumberMatchPattern(orderNumber: string): string {
  const key = orderNumberMatchKey(orderNumber);
  if (!key) return "^[[:space:]]*$";
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `^[[:space:]]*0*${escaped}[[:space:]]*$`;
}

/**
 * Returns true if `url` is a valid http(s) URL.
 * If no scheme is provided, https:// is assumed before validation.
 */
export function isValidUrl(url: string): boolean {
  try {
    let normalized = url.trim();
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      normalized = "https://" + normalized;
    }
    const parsedUrl = new URL(normalized);
    return ["http:", "https:"].includes(parsedUrl.protocol) && Boolean(parsedUrl.hostname);
  } catch {
    return false;
  }
}

export const isValidWetransferLink = isValidUrl;

/**
 * Prepends https:// to a URL if no scheme is present.
 */
export function ensureHttps(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return "https://" + trimmed;
  }
  return trimmed;
}
