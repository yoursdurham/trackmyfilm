/**
 * Pure validation for Squarespace intake drafts.
 * API routes and tests both import from here. No database or email side effects.
 */

import type { FilmProcess, IncomingDraftStatus, RollDetail } from "./types";
import {
  DROP_OFF_FILM_TYPES,
  isValidEmail,
  normalizeEmail,
  normalizeFilmType,
  normalizeOrderNumber,
} from "./validation";

/** Matches the roll cap on the New Drop-off form. */
export const MAX_INCOMING_DRAFT_ROLLS = 20;

export const INCOMING_DRAFT_PROCESSES = ["Color", "Black & White"] as const satisfies readonly FilmProcess[];
export const INCOMING_DRAFT_SCAN_SIZES = ["Standard", "High-Res", "TIFF", "Process Only"] as const;
export const INCOMING_DRAFT_STATUSES = ["pending", "accepted", "dismissed"] as const satisfies readonly IncomingDraftStatus[];

const PROCESS_SET = new Set<string>(INCOMING_DRAFT_PROCESSES);
const SCAN_SIZE_SET = new Set<string>(INCOMING_DRAFT_SCAN_SIZES);
const DROP_OFF_FILM_TYPE_SET = new Set<string>(DROP_OFF_FILM_TYPES);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_PATTERN = /^[a-z0-9][a-z0-9 _.-]{0,63}$/i;
const MAX_NAME_LENGTH = 200;
const MAX_NOTES_LENGTH = 5000;
const MAX_STOCK_LENGTH = 200;
const MAX_ORDER_NUMBER_LENGTH = 64;

export interface IncomingDraftInput {
  squarespace_order_number: string;
  customer_name: string;
  customer_email: string | null;
  dropoff_date: string | null;
  roll_count: number;
  roll_details: RollDetail[];
  notes: string | null;
  source: string;
}

export type IncomingDraftParseResult =
  | { ok: true; value: IncomingDraftInput }
  | { ok: false; error: string };

export function isIncomingDraftUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function readOrderNumber(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Validates a bot payload and returns the row to insert.
 * `status` is intentionally not read — callers always store `pending`.
 */
export function parseIncomingDraftPayload(body: unknown): IncomingDraftParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const record = body as Record<string, unknown>;

  const rawOrderNumber = readOrderNumber(record.squarespace_order_number);
  if (rawOrderNumber === null) {
    return { ok: false, error: "squarespace_order_number is required" };
  }
  const squarespaceOrderNumber = normalizeOrderNumber(rawOrderNumber);
  if (!squarespaceOrderNumber || squarespaceOrderNumber.length > MAX_ORDER_NUMBER_LENGTH) {
    return { ok: false, error: "squarespace_order_number is required" };
  }
  if (/[\u0000-\u001F]/.test(squarespaceOrderNumber)) {
    return { ok: false, error: "squarespace_order_number is invalid" };
  }

  if (typeof record.customer_name !== "string" || !record.customer_name.trim()) {
    return { ok: false, error: "customer_name is required" };
  }
  const customerName = record.customer_name.trim();
  if (customerName.length > MAX_NAME_LENGTH) {
    return { ok: false, error: "customer_name is too long" };
  }

  let customerEmail: string | null = null;
  if (record.customer_email !== undefined && record.customer_email !== null && record.customer_email !== "") {
    if (typeof record.customer_email !== "string") {
      return { ok: false, error: "customer_email is invalid" };
    }
    const normalizedEmail = normalizeEmail(record.customer_email);
    if (!isValidEmail(normalizedEmail)) {
      return { ok: false, error: "customer_email is invalid" };
    }
    customerEmail = normalizedEmail;
  }

  let dropoffDate: string | null = null;
  if (record.dropoff_date !== undefined && record.dropoff_date !== null && record.dropoff_date !== "") {
    if (typeof record.dropoff_date !== "string" || !isIsoDate(record.dropoff_date)) {
      return { ok: false, error: "dropoff_date must be YYYY-MM-DD" };
    }
    dropoffDate = record.dropoff_date;
  }

  if (!Array.isArray(record.roll_details) || record.roll_details.length === 0) {
    return { ok: false, error: "roll_details must be a non-empty array" };
  }
  if (record.roll_details.length > MAX_INCOMING_DRAFT_ROLLS) {
    return { ok: false, error: `roll_details cannot exceed ${MAX_INCOMING_DRAFT_ROLLS} rolls` };
  }

  if (typeof record.roll_count !== "number" || !Number.isInteger(record.roll_count)) {
    return { ok: false, error: "roll_count must be a positive integer" };
  }
  if (record.roll_count !== record.roll_details.length) {
    return { ok: false, error: "roll_count must match roll_details length" };
  }

  const rollDetails: RollDetail[] = [];
  for (let i = 0; i < record.roll_details.length; i++) {
    const parsed = parseRoll(record.roll_details[i], i);
    if (!parsed.ok) return parsed;
    rollDetails.push(parsed.roll);
  }

  let notes: string | null = null;
  if (record.notes !== undefined && record.notes !== null) {
    if (typeof record.notes !== "string") {
      return { ok: false, error: "notes must be a string" };
    }
    const trimmedNotes = record.notes.trim();
    if (trimmedNotes.length > MAX_NOTES_LENGTH) {
      return { ok: false, error: "notes is too long" };
    }
    notes = trimmedNotes || null;
  }

  let source = "squarespace";
  if (record.source !== undefined && record.source !== null && record.source !== "") {
    if (typeof record.source !== "string" || !SOURCE_PATTERN.test(record.source.trim())) {
      return { ok: false, error: "source is invalid" };
    }
    source = record.source.trim();
  }

  return {
    ok: true,
    value: {
      squarespace_order_number: squarespaceOrderNumber,
      customer_name: customerName,
      customer_email: customerEmail,
      dropoff_date: dropoffDate,
      roll_count: record.roll_count,
      roll_details: rollDetails,
      notes,
      source,
    },
  };
}

function parseRoll(
  value: unknown,
  index: number
): { ok: true; roll: RollDetail } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: `roll_details[${index}] must be an object` };
  }
  const roll = value as Record<string, unknown>;

  const filmType = normalizeFilmType(roll.film_type);
  if (!filmType || !DROP_OFF_FILM_TYPE_SET.has(filmType)) {
    return {
      ok: false,
      error: `roll_details[${index}].film_type is invalid (expected one of: ${DROP_OFF_FILM_TYPES.join(", ")})`,
    };
  }

  if (typeof roll.film_process !== "string" || !PROCESS_SET.has(roll.film_process)) {
    return {
      ok: false,
      error: `roll_details[${index}].film_process is invalid (expected one of: ${INCOMING_DRAFT_PROCESSES.join(", ")})`,
    };
  }

  let scanSize: RollDetail["scan_size"] = "Standard";
  if (roll.scan_size !== undefined && roll.scan_size !== null && roll.scan_size !== "") {
    if (typeof roll.scan_size !== "string" || !SCAN_SIZE_SET.has(roll.scan_size)) {
      return {
        ok: false,
        error: `roll_details[${index}].scan_size is invalid (expected one of: ${INCOMING_DRAFT_SCAN_SIZES.join(", ")})`,
      };
    }
    scanSize = roll.scan_size as RollDetail["scan_size"];
  }

  if (roll.prints_4x6 !== undefined && roll.prints_4x6 !== null && typeof roll.prints_4x6 !== "boolean") {
    return { ok: false, error: `roll_details[${index}].prints_4x6 must be a boolean` };
  }

  let filmStock: string | undefined;
  if (roll.film_stock !== undefined && roll.film_stock !== null && roll.film_stock !== "") {
    if (typeof roll.film_stock !== "string") {
      return { ok: false, error: `roll_details[${index}].film_stock must be a string` };
    }
    const trimmedStock = roll.film_stock.trim();
    if (trimmedStock.length > MAX_STOCK_LENGTH) {
      return { ok: false, error: `roll_details[${index}].film_stock is too long` };
    }
    if (trimmedStock) filmStock = trimmedStock;
  }

  return {
    ok: true,
    roll: {
      film_type: filmType,
      film_process: roll.film_process as FilmProcess,
      scan_size: scanSize,
      prints_4x6: roll.prints_4x6 === true,
      ...(filmStock ? { film_stock: filmStock } : {}),
    },
  };
}

export type IncomingDraftStatusChange =
  | { ok: true; status: "accepted" | "dismissed"; changed: boolean }
  | { ok: false; reason: "invalid" | "conflict"; error: string };

/**
 * Pending drafts can be accepted or dismissed.
 * Repeating the current terminal status is a no-op. Crossing between them is rejected.
 */
export function resolveIncomingDraftStatusChange(
  current: IncomingDraftStatus,
  requested: unknown
): IncomingDraftStatusChange {
  if (requested !== "accepted" && requested !== "dismissed") {
    return { ok: false, reason: "invalid", error: "status must be accepted or dismissed" };
  }
  if (current === requested) {
    return { ok: true, status: requested, changed: false };
  }
  if (current !== "pending") {
    return {
      ok: false,
      reason: "conflict",
      error: `Draft is already ${current} and cannot be marked ${requested}`,
    };
  }
  return { ok: true, status: requested, changed: true };
}
