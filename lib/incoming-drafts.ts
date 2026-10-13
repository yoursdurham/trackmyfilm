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
  orderNumbersMatch,
} from "./validation";

/** Matches the roll cap on the New Drop-off form. */
export const MAX_INCOMING_DRAFT_ROLLS = 20;

export const INCOMING_DRAFT_PROCESSES = ["Color", "Black & White"] as const satisfies readonly FilmProcess[];
export const INCOMING_DRAFT_SCAN_SIZES = ["Standard", "High-Res", "TIFF", "Process Only"] as const;
export const PENDING_INTAKE_STATUS = "Pending Intake" as const;
export const INCOMING_DRAFT_STATUSES = [PENDING_INTAKE_STATUS, "accepted", "dismissed"] as const satisfies readonly IncomingDraftStatus[];

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
  external_order_id: string;
  customer_name: string;
  customer_email: string | null;
  dropoff_date: string | null;
  roll_count: number;
  roll_details: RollDetail[];
  notes: string | null;
  /**
   * Raw Squarespace answer for the film-type question. Omitted when the
   * customer did not answer. The column is added in migration 022.
   */
  squarespace_film_listing?: string | null;
  import_source: string;
}

/** Row written on import. Status is always Pending Intake — never a received order. */
export function buildIncomingDraftInsert(input: IncomingDraftInput) {
  const listing = input.squarespace_film_listing?.trim();
  return {
    squarespace_order_number: input.squarespace_order_number,
    external_order_id: input.external_order_id,
    customer_name: input.customer_name,
    customer_email: input.customer_email,
    dropoff_date: input.dropoff_date,
    roll_count: input.roll_count,
    roll_details: input.roll_details,
    notes: input.notes,
    ...(listing ? { squarespace_film_listing: listing } : {}),
    import_source: input.import_source,
    status: PENDING_INTAKE_STATUS,
  };
}

export function normalizeIncomingFilmProcess(value: unknown): FilmProcess | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "Color" || trimmed === "Black & White") return trimmed;
  if (/^c-?41$/i.test(trimmed)) return "Color";
  return null;
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
 * `status` is intentionally not read — callers always store Pending Intake.
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

  const rawExternalId = readOrderNumber(record.external_order_id);
  if (rawExternalId === null) {
    return { ok: false, error: "external_order_id is required" };
  }
  const externalOrderId = rawExternalId.trim();
  if (!externalOrderId || externalOrderId.length > 128 || /[\u0000-\u001F]/.test(externalOrderId)) {
    return { ok: false, error: "external_order_id is invalid" };
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

  const rawSource = record.import_source ?? record.source;
  let importSource = "squarespace";
  if (rawSource !== undefined && rawSource !== null && rawSource !== "") {
    if (typeof rawSource !== "string" || !SOURCE_PATTERN.test(rawSource.trim())) {
      return { ok: false, error: "import_source is invalid" };
    }
    importSource = rawSource.trim();
  }

  return {
    ok: true,
    value: {
      squarespace_order_number: squarespaceOrderNumber,
      external_order_id: externalOrderId,
      customer_name: customerName,
      customer_email: customerEmail,
      dropoff_date: dropoffDate,
      roll_count: record.roll_count,
      roll_details: rollDetails,
      notes,
      import_source: importSource,
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

  const filmProcess = normalizeIncomingFilmProcess(roll.film_process);
  if (!filmProcess) {
    return {
      ok: false,
      error: `roll_details[${index}].film_process is invalid (expected one of: ${INCOMING_DRAFT_PROCESSES.join(", ")}, C41)`,
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
      film_process: filmProcess,
      scan_size: scanSize,
      prints_4x6: roll.prints_4x6 === true,
      ...(filmStock ? { film_stock: filmStock } : {}),
    },
  };
}

export type IncomingDraftStatusChange =
  | { ok: true; status: "accepted" | "dismissed"; changed: boolean }
  | { ok: false; reason: "invalid" | "conflict"; error: string };

/** Thrown-error code when the database check constraint still rejects dismissed. */
export const DISMISSED_STATUS_NOT_READY = "dismissed_status_not_ready";

export const DISMISSED_STATUS_MIGRATION_ERROR =
  "Dismiss is not saved yet. Run migration 021_keep_dismissed_squarespace_orders.sql, then try again.";

export function isDismissedStatusNotReady(err: unknown): boolean {
  return Boolean(
    err
    && typeof err === "object"
    && "code" in err
    && (err as { code?: unknown }).code === DISMISSED_STATUS_NOT_READY
  );
}

/**
 * True when saving status = dismissed was rejected by the pre-021 check constraint.
 * Other check failures (roll count, blank name) are left to the caller.
 */
export function isDismissedStatusCheckViolation(
  error: { message?: string; code?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("incoming_squarespace_drafts_status_check")) return true;
  return String(error.code ?? "") === "23514" && message.includes("status");
}

/**
 * Pending Intake can be marked accepted or dismissed.
 * Dismissed is stored on the row so a later import can skip that order.
 * Repeating the current status is a no-op. Accepted drafts are not dismissed.
 */
export function resolveIncomingDraftStatusChange(
  current: IncomingDraftStatus,
  requested: unknown
): IncomingDraftStatusChange {
  if (requested !== "accepted" && requested !== "dismissed") {
    return { ok: false, reason: "invalid", error: "status must be accepted or dismissed" };
  }
  if (requested === "dismissed") {
    if (current === "dismissed") {
      return { ok: true, status: "dismissed", changed: false };
    }
    if (current !== PENDING_INTAKE_STATUS) {
      return {
        ok: false,
        reason: "conflict",
        error: `Draft is already ${current} and cannot be dismissed`,
      };
    }
    return { ok: true, status: "dismissed", changed: true };
  }
  if (current === "accepted") {
    return { ok: true, status: "accepted", changed: false };
  }
  if (current !== PENDING_INTAKE_STATUS) {
    return {
      ok: false,
      reason: "conflict",
      error: `Draft is already ${current} and cannot be marked accepted`,
    };
  }
  return { ok: true, status: "accepted", changed: true };
}

/**
 * A stored intake row blocks a new Squarespace import of the same order.
 * The Squarespace order id matches exactly. Order numbers use the existing
 * normalization, so leading zeros are equal (01034 and 1034). Dismissed rows
 * are kept so they block too. A row with no identity fields still blocks,
 * because the lookup already selected it.
 */
export function squarespaceDraftBlocksImport(
  existing: unknown,
  incoming: { squarespace_order_number: string; external_order_id: string },
): boolean {
  if (!existing || typeof existing !== "object") return false;
  const row = existing as {
    squarespace_order_number?: string | null;
    external_order_id?: string | null;
  };

  const existingExternal = typeof row.external_order_id === "string" ? row.external_order_id.trim() : "";
  const incomingExternal = incoming.external_order_id.trim();
  if (existingExternal && incomingExternal && existingExternal === incomingExternal) return true;

  const existingNumber = typeof row.squarespace_order_number === "string" ? row.squarespace_order_number : "";
  if (existingNumber.trim()) {
    return orderNumbersMatch(existingNumber, incoming.squarespace_order_number);
  }

  return true;
}

export interface IncomingDraftDeleteMatch {
  orderNumbers: string[];
  externalOrderIds: string[];
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/**
 * Keys for intake rows that share this film order. Callers delete pending and
 * accepted rows with these keys. Dismissed rows are left in place so the
 * Squarespace order is not imported again. Matches the draft order number
 * and external_order_id, including when the film order number is the external id.
 */
export function incomingDraftDeleteMatch(order: {
  order_number: string;
  external_order_id?: string | null;
}): IncomingDraftDeleteMatch {
  const trimmed = typeof order.order_number === "string" ? order.order_number.trim() : "";
  const normalized = trimmed ? normalizeOrderNumber(trimmed) : "";
  return {
    orderNumbers: uniqueNonEmpty([normalized]),
    externalOrderIds: uniqueNonEmpty([order.external_order_id, trimmed, normalized]),
  };
}
