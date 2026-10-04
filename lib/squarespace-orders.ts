/**
 * Squarespace Commerce Orders API (v1.0) and the mapping from a store order
 * to a Pending Intake draft. No database or email side effects.
 *
 * https://developers.squarespace.com/commerce-apis/retrieve-all-orders
 * Every request needs Authorization: Bearer and a User-Agent. User-Agent is
 * required; Squarespace rejects requests that omit it.
 * List results are pages of up to 50 orders ordered by modifiedOn.
 * The next page uses pagination.nextPageCursor alone — cursor cannot be
 * combined with other query parameters.
 */

import { parseIncomingDraftPayload, type IncomingDraftInput, MAX_INCOMING_DRAFT_ROLLS } from "./incoming-drafts";
import type { RollDetail } from "./types";

export const SQUARESPACE_API_KEY_ENV = "SQUARESPACE_API_KEY";
export const SQUARESPACE_ORDERS_ENDPOINT = "https://api.squarespace.com/1.0/commerce/orders";
export const SQUARESPACE_USER_AGENT = "TrackMyFilm (trackmyfilm.com)";
/** How far back Check Squarespace looks, by modifiedOn. */
export const SQUARESPACE_LOOKBACK_DAYS = 60;
export const SQUARESPACE_MAX_PAGES = 20;

const MISSING_KEY_MESSAGE =
  "SQUARESPACE_API_KEY is not set. Add it in Vercel with the Squarespace Orders read permission, then try Check Squarespace again.";

export interface SquarespaceCheckError {
  orderNumber?: string;
  message: string;
}

export interface SquarespaceCheckSummary {
  configured: boolean;
  message?: string;
  imported: number;
  skippedDuplicate: number;
  skippedNoFilm: number;
  errors: SquarespaceCheckError[];
  importedOrderNumbers: string[];
  truncated: boolean;
}

export function missingSquarespaceApiKeySummary(): SquarespaceCheckSummary {
  return {
    configured: false,
    message: MISSING_KEY_MESSAGE,
    imported: 0,
    skippedDuplicate: 0,
    skippedNoFilm: 0,
    errors: [],
    importedOrderNumbers: [],
    truncated: false,
  };
}

export function emptySquarespaceCheckSummary(): SquarespaceCheckSummary {
  return {
    configured: true,
    imported: 0,
    skippedDuplicate: 0,
    skippedNoFilm: 0,
    errors: [],
    importedOrderNumbers: [],
    truncated: false,
  };
}

/**
 * First page is time-boxed with modifiedAfter and modifiedBefore.
 * Later pages send only cursor. fulfillmentStatus is never set, so pending,
 * fulfilled, and canceled orders are all included.
 */
export function buildSquarespaceOrdersUrl(page: {
  cursor?: string | null;
  modifiedAfter?: string;
  modifiedBefore?: string;
}): string {
  const url = new URL(SQUARESPACE_ORDERS_ENDPOINT);
  if (page.cursor) {
    url.searchParams.set("cursor", page.cursor);
    return url.toString();
  }
  if (page.modifiedAfter) url.searchParams.set("modifiedAfter", page.modifiedAfter);
  if (page.modifiedBefore) url.searchParams.set("modifiedBefore", page.modifiedBefore);
  return url.toString();
}

export function squarespaceLookbackWindow(now: Date): { modifiedAfter: string; modifiedBefore: string } {
  const modifiedBefore = now.toISOString();
  const after = new Date(now.getTime() - SQUARESPACE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  return { modifiedAfter: after.toISOString(), modifiedBefore };
}

export interface SquarespaceOrdersPage {
  orders: unknown[];
  hasNextPage: boolean;
  nextPageCursor: string | null;
}

export function parseSquarespaceOrdersPage(body: unknown):
  | { ok: true; page: SquarespaceOrdersPage }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Squarespace returned an unexpected response" };
  }
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.result)) {
    return { ok: false, error: "Squarespace response is missing orders" };
  }
  const pagination = record.pagination && typeof record.pagination === "object" && !Array.isArray(record.pagination)
    ? record.pagination as Record<string, unknown>
    : {};
  const nextPageCursor = typeof pagination.nextPageCursor === "string" && pagination.nextPageCursor.trim()
    ? pagination.nextPageCursor
    : null;
  return {
    ok: true,
    page: {
      orders: record.result,
      hasNextPage: pagination.hasNextPage === true && nextPageCursor !== null,
      nextPageCursor,
    },
  };
}

export type FetchRecentSquarespaceOrdersResult =
  | { ok: true; orders: unknown[]; truncated: boolean }
  | { ok: false; error: string; orders: unknown[]; truncated: boolean };

export async function fetchRecentSquarespaceOrders(
  fetchImpl: typeof fetch,
  apiKey: string,
  now: Date,
): Promise<FetchRecentSquarespaceOrdersResult> {
  const window = squarespaceLookbackWindow(now);
  const orders: unknown[] = [];
  let cursor: string | null = null;

  for (let pageNumber = 0; pageNumber < SQUARESPACE_MAX_PAGES; pageNumber++) {
    const url = buildSquarespaceOrdersUrl(cursor
      ? { cursor }
      : window);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": SQUARESPACE_USER_AGENT,
          Accept: "application/json",
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network error";
      return { ok: false, error: `Could not reach Squarespace: ${message}`, orders, truncated: false };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: `Squarespace orders request failed (${response.status})`,
        orders,
        truncated: false,
      };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, error: "Squarespace returned invalid JSON", orders, truncated: false };
    }

    const parsed = parseSquarespaceOrdersPage(body);
    if (!parsed.ok) return { ok: false, error: parsed.error, orders, truncated: false };
    orders.push(...parsed.page.orders);
    if (!parsed.page.hasNextPage || !parsed.page.nextPageCursor) {
      return { ok: true, orders, truncated: false };
    }
    cursor = parsed.page.nextPageCursor;
  }

  return { ok: true, orders, truncated: true };
}

type FilmSize = "35mm" | "120" | "110";

interface NamedValue {
  label: string;
  value: string;
}

export type ClassifiedSquarespaceOrder =
  | { kind: "skip_no_film" }
  | { kind: "error"; orderNumber?: string; message: string }
  | { kind: "import"; draft: IncomingDraftInput };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * A film-processing service, not a shop sale.
 * Product names look like "C41 (color) - 35mm Development" or
 * "Black & White - 120 Development" / "Black and White - 110 Development".
 * Film rolls and cameras do not match because they are not development.
 */
export function isFilmProcessingProductName(productName: string): boolean {
  if (!/develop/i.test(productName)) return false;
  return filmTypeFromProductName(productName) !== null || processFromProductName(productName) !== null;
}

export function filmTypeFromProductName(productName: string): FilmSize | null {
  const matches: Array<{ index: number; type: FilmSize }> = [];
  const thirtyFive = /\b35\s*mm\b/i.exec(productName);
  if (thirtyFive) matches.push({ index: thirtyFive.index, type: "35mm" });
  const oneTen = /\b110\b/.exec(productName);
  if (oneTen) matches.push({ index: oneTen.index, type: "110" });
  const oneTwenty = /\b120\b/.exec(productName);
  if (oneTwenty) matches.push({ index: oneTwenty.index, type: "120" });
  if (matches.length === 0) return null;
  const developAt = productName.search(/develop/i);
  if (developAt < 0) return matches[0].type;
  const beforeDevelop = matches.filter((match) => match.index <= developAt);
  const pool = beforeDevelop.length > 0 ? beforeDevelop : matches;
  pool.sort((a, b) => Math.abs(developAt - a.index) - Math.abs(developAt - b.index));
  return pool[0].type;
}

function processFromProductName(productName: string): "Color" | "Black & White" | null {
  const blackAndWhite = /black\s*(?:&|and)\s*white|\bb\s*&\s*w\b|\bbw\b/i.test(productName);
  const color = /\bc-?\s*41\b/i.test(productName) || /\bcolor\b/i.test(productName);
  if (blackAndWhite && color) {
    return /\bc-?\s*41\b/i.test(productName) ? "Color" : null;
  }
  if (blackAndWhite) return "Black & White";
  if (color) return "Color";
  return null;
}

function lineItemOptions(line: Record<string, unknown>): NamedValue[] {
  const options: NamedValue[] = [];
  for (const key of ["variantOptions", "customizations"] as const) {
    const list = line[key];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const record = asRecord(entry);
      if (!record) continue;
      const label = readString(record.optionName) ?? readString(record.label) ?? "";
      const value = readString(record.value) ?? "";
      if (!label.trim() && !value.trim()) continue;
      options.push({ label: label.trim(), value: value.trim() });
    }
  }
  return options;
}

function scanSizeFromOptions(options: NamedValue[]): RollDetail["scan_size"] {
  for (const option of options) {
    const haystack = `${option.label} ${option.value}`;
    if (!/process|scan/i.test(haystack)) continue;
    const value = option.value.toLowerCase();
    if (value.includes("high res") || value.includes("high-res")) return "High-Res";
    if (value.includes("tiff")) return "TIFF";
    if (value.includes("process only")) return "Process Only";
    if (value.includes("standard")) return "Standard";
  }
  return "Standard";
}

function printsFromOptions(options: NamedValue[]): boolean {
  for (const option of options) {
    if (!/4\s*x\s*6|print/i.test(option.label)) continue;
    if (/^(yes|y|true)$/i.test(option.value)) return true;
    if (/^(no|n|false)$/i.test(option.value)) return false;
  }
  return false;
}

function stockFromOptions(options: NamedValue[]): string | undefined {
  for (const option of options) {
    if (!/stock/i.test(option.label)) continue;
    if (!option.value || /^(yes|no|n\/a|none|-)$/i.test(option.value)) continue;
    return option.value.slice(0, 200);
  }
  return undefined;
}

function customerNameFromOrder(order: Record<string, unknown>): string | null {
  for (const key of ["billingAddress", "shippingAddress"] as const) {
    const address = asRecord(order[key]);
    if (!address) continue;
    const first = readString(address.firstName)?.trim() ?? "";
    const last = readString(address.lastName)?.trim() ?? "";
    const name = `${first} ${last}`.trim();
    if (name) return name;
  }
  return null;
}

function orderNumberFrom(order: Record<string, unknown>): string | undefined {
  const raw = readString(order.orderNumber);
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

function mapFilmLine(line: Record<string, unknown>, index: number):
  | { ok: true; rolls: RollDetail[] }
  | { ok: false; error: string } {
  const productName = readString(line.productName)?.trim() ?? "";
  const filmType = filmTypeFromProductName(productName);
  if (!filmType) {
    return { ok: false, error: `Film processing item "${productName || `line ${index + 1}`}" is missing a film type (35mm, 120, or 110)` };
  }
  const filmProcess = processFromProductName(productName);
  if (!filmProcess) {
    return { ok: false, error: `Film processing item "${productName}" is missing C41/color or black and white` };
  }
  const quantity = line.quantity;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, error: `Film processing item "${productName}" has an invalid quantity` };
  }
  const options = lineItemOptions(line);
  const roll: RollDetail = {
    film_type: filmType,
    film_process: filmProcess,
    scan_size: scanSizeFromOptions(options),
    prints_4x6: printsFromOptions(options),
  };
  const stock = stockFromOptions(options);
  if (stock) roll.film_stock = stock;
  return { ok: true, rolls: Array.from({ length: quantity }, () => ({ ...roll })) };
}

/**
 * Turns one Squarespace order into a draft, or explains why it is skipped.
 * Fulfillment status is ignored.
 */
export function classifySquarespaceOrder(order: unknown): ClassifiedSquarespaceOrder {
  const record = asRecord(order);
  if (!record) return { kind: "error", message: "Squarespace order was not an object" };

  const orderNumber = orderNumberFrom(record);
  const lineItems = Array.isArray(record.lineItems) ? record.lineItems : [];
  const rolls: RollDetail[] = [];
  const problems: string[] = [];
  let sawFilm = false;

  lineItems.forEach((line, index) => {
    const item = asRecord(line);
    const productName = item ? readString(item.productName)?.trim() ?? "" : "";
    if (!item || !isFilmProcessingProductName(productName)) return;
    sawFilm = true;
    const mapped = mapFilmLine(item, index);
    if (!mapped.ok) problems.push(mapped.error);
    else rolls.push(...mapped.rolls);
  });

  if (!sawFilm) return { kind: "skip_no_film" };
  if (problems.length > 0) {
    return { kind: "error", orderNumber, message: problems[0] };
  }
  if (rolls.length > MAX_INCOMING_DRAFT_ROLLS) {
    return {
      kind: "error",
      orderNumber,
      message: `Order has ${rolls.length} rolls, which is over the ${MAX_INCOMING_DRAFT_ROLLS} roll limit`,
    };
  }

  const externalOrderId = readString(record.id)?.trim() ?? "";
  if (!externalOrderId) {
    return { kind: "error", orderNumber, message: "Squarespace order is missing an id" };
  }
  const customerName = customerNameFromOrder(record);
  if (!customerName) {
    return { kind: "error", orderNumber, message: "Squarespace order is missing a customer name" };
  }

  let dropoffDate: string | null = null;
  const createdOn = readString(record.createdOn);
  if (createdOn && /^\d{4}-\d{2}-\d{2}/.test(createdOn)) {
    dropoffDate = createdOn.slice(0, 10);
  }

  const email = readString(record.customerEmail)?.trim() ?? "";
  const parsed = parseIncomingDraftPayload({
    squarespace_order_number: orderNumber ?? "",
    external_order_id: externalOrderId,
    import_source: "squarespace",
    customer_name: customerName,
    customer_email: email || null,
    dropoff_date: dropoffDate,
    roll_count: rolls.length,
    roll_details: rolls,
  });
  if (!parsed.ok) {
    return { kind: "error", orderNumber, message: parsed.error };
  }
  return { kind: "import", draft: parsed.value };
}
