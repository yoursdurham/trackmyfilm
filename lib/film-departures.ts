/**
 * Public "now boarding" board for film that is still in process.
 *
 * The display payload is unauthenticated. Names are first name plus last
 * initial only. Emails, phones, order numbers, and full last names never
 * leave this module.
 *
 * Lab rows are listed before studio rows. Within a location, the newest
 * receipt is first. Lab film has already left for the lab; studio film is
 * still at the gate. Newest-first keeps today's names on page one, and the
 * SINCE column reads in the same order as the rows.
 *
 * Studio film is CHECKED IN. Lab film that reached the lab on or after the
 * most recent Tue/Fri noon run is IN FLIGHT (this batch). Older lab film
 * is DEVELOPING.
 */

import { ORDER_STATUS } from "@/lib/constants";
import {
  lastLabRunAt,
  nextLabRunLabel,
  rollsOnOrder,
  shopCalendarDate,
  shopNoonUtc,
  type RollCountSource,
} from "@/lib/film-metrics";
import { normalizeCustomerName } from "@/lib/validation";

export const DEPARTURE_LOCATIONS = ["STUDIO", "LAB"] as const;
export type DepartureLocation = (typeof DEPARTURE_LOCATIONS)[number];

export const DEPARTURE_STATUSES = ["CHECKED IN", "IN FLIGHT", "DEVELOPING"] as const;
export type DepartureStatus = (typeof DEPARTURE_STATUSES)[number];

export interface DepartureRow {
  name: string;
  rolls: number;
  location: DepartureLocation;
  status: DepartureStatus;
  since: string;
}

export interface FilmDepartures {
  rows: DepartureRow[];
  people: number;
  studioRolls: number;
  labRolls: number;
  nextLabRun: string;
}

/** Columns for the in-process query. No email, phone, notes, or order number. */
export const DEPARTURE_ORDER_SELECT = [
  "id",
  "customer_id",
  "customer_name",
  "status",
  "roll_count",
  "roll_details",
  "received_by_yours_at",
  "at_lab_at",
  "dropoff_date",
  "created_at",
  "status_updated_at",
].join(", ");

export interface DepartureOrder extends RollCountSource {
  id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  status?: string | null;
  received_by_yours_at?: string | null;
  at_lab_at?: string | null;
  dropoff_date?: string | null;
  created_at?: string | null;
  status_updated_at?: string | null;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;
const MAX_ROWS = 500;
const MAX_NAME_LENGTH = 28;
const GUEST_NAME = "GUEST";

const TITLES = new Set(["dr", "mr", "mrs", "ms", "miss", "mx", "prof"]);
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

interface When {
  at: number;
  since: string;
}

interface Bucket {
  personKey: string;
  name: string;
  location: DepartureLocation;
  rolls: number;
  at: number | null;
  since: string;
}

function parseTimestamp(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatSince(month: number, day: number): string {
  const label = MONTHS[month - 1];
  if (!label || day < 1 || day > 31) return "";
  return `${label} ${day}`;
}

function fromInstant(value?: string | null): When | null {
  const date = parseTimestamp(value);
  if (!date) return null;
  const parts = shopCalendarDate(date);
  const since = formatSince(parts.month, parts.day);
  if (!since) return null;
  return { at: date.getTime(), since };
}

function fromDropoff(value?: string | null): When | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const since = formatSince(month, day);
  if (!since) return null;
  return { at: shopNoonUtc(year, month, day).getTime(), since };
}

function firstWhen(...candidates: (When | null)[]): When | null {
  for (const candidate of candidates) {
    if (candidate) return candidate;
  }
  return null;
}

function nameTokens(input: string): string[] {
  const withoutTags = input.replace(/<[^>]*>/g, " ");
  const local = withoutTags.includes("@") ? withoutTags.slice(0, withoutTags.indexOf("@")) : withoutTags;
  const tokens: string[] = [];
  let current = "";
  const push = () => {
    const trimmed = current.replace(/^['’-]+|['’-]+$/g, "");
    if (trimmed) tokens.push(trimmed);
    current = "";
  };
  for (const char of local) {
    if (char === "'" || char === "’" || char === "-" || char === "‐") {
      if (current) current += char === "’" ? "'" : char === "‐" ? "-" : char;
      continue;
    }
    if (/\p{L}/u.test(char)) {
      current += char;
      continue;
    }
    push();
  }
  push();
  return tokens;
}

function clipBoardName(value: string): string {
  if (value.length <= MAX_NAME_LENGTH) return value;
  const initial = value.match(/ [\p{Lu}]\.$/u);
  if (!initial) return value.slice(0, MAX_NAME_LENGTH).trim();
  const room = MAX_NAME_LENGTH - initial[0].length;
  return `${value.slice(0, value.length - initial[0].length).slice(0, room).trimEnd()}${initial[0]}`;
}

/**
 * First name plus last initial, uppercased.
 * One word stays whole ("CHER"). Two words are first plus last ("JUSTIN E.").
 * Three or more keep every word but the last as the first name ("MARY ANN S."),
 * so a multi-word first name is not collapsed to its first token.
 * A leading title and a trailing Jr/Sr/II/III/IV are dropped.
 */
export function formatDepartureName(input: unknown): string {
  if (typeof input !== "string") return "";
  let tokens = nameTokens(input);
  while (tokens.length > 1 && TITLES.has(tokens[0].toLowerCase())) tokens = tokens.slice(1);
  while (tokens.length > 1 && SUFFIXES.has(tokens[tokens.length - 1].toLowerCase())) {
    tokens = tokens.slice(0, -1);
  }
  if (tokens.length === 0) return "";
  const upper = tokens.map((token) => token.toLocaleUpperCase("en-US"));
  if (upper.length === 1) return clipBoardName(upper[0]);
  const initial = upper[upper.length - 1].charAt(0);
  if (!/\p{Lu}/u.test(initial)) return "";
  const first = upper.slice(0, -1).join(" ");
  return clipBoardName(`${first} ${initial}.`);
}

export function isSafeBoardName(name: string): boolean {
  if (!name || name.length > MAX_NAME_LENGTH || /[@\d]/.test(name)) return false;
  const parts = name.split(" ");
  if (parts.some((part) => part.length === 0)) return false;
  if (parts.length === 1) return /^[\p{Lu}\p{M}'’-]+$/u.test(parts[0]);
  const initial = parts[parts.length - 1];
  if (!/^[\p{Lu}]\.$/u.test(initial)) return false;
  return parts.slice(0, -1).every((part) => /^[\p{Lu}\p{M}'’-]+$/u.test(part));
}

function boardName(input: unknown): string {
  const formatted = formatDepartureName(input);
  return isSafeBoardName(formatted) ? formatted : GUEST_NAME;
}

function locationForStatus(status: string | null | undefined): DepartureLocation | null {
  if (status === ORDER_STATUS.RECEIVED_BY_YOURS) return "STUDIO";
  if (status === ORDER_STATUS.RECEIVED_AT_LAB) return "LAB";
  return null;
}

function personKey(order: DepartureOrder, index: number): string {
  const id = order.customer_id?.trim();
  if (id) return `id:${id}`;
  const name = normalizeCustomerName(order.customer_name ?? "");
  if (name) return `name:${name}`;
  const orderId = order.id?.trim();
  if (orderId) return `order:${orderId}`;
  return `row:${index}`;
}

function whenFor(order: DepartureOrder, location: DepartureLocation): When | null {
  if (location === "LAB") {
    return firstWhen(
      fromInstant(order.at_lab_at),
      fromInstant(order.status_updated_at),
      fromInstant(order.received_by_yours_at),
      fromDropoff(order.dropoff_date),
      fromInstant(order.created_at),
    );
  }
  return firstWhen(
    fromInstant(order.received_by_yours_at),
    fromDropoff(order.dropoff_date),
    fromInstant(order.created_at),
    fromInstant(order.status_updated_at),
  );
}

function statusFor(location: DepartureLocation, at: number | null, lastRunMs: number): DepartureStatus {
  if (location === "STUDIO") return "CHECKED IN";
  if (at !== null && at >= lastRunMs) return "IN FLIGHT";
  return "DEVELOPING";
}

function locationRank(location: DepartureLocation): number {
  return location === "LAB" ? 0 : 1;
}

export function computeFilmDepartures(orders: readonly DepartureOrder[], now = new Date()): FilmDepartures {
  const lastRunMs = lastLabRunAt(now).getTime();
  const buckets = new Map<string, Bucket>();

  orders.forEach((order, index) => {
    const location = locationForStatus(order.status);
    if (!location) return;
    const key = `${personKey(order, index)}|${location}`;
    const name = boardName(order.customer_name);
    const when = whenFor(order, location);
    const rolls = rollsOnOrder(order);
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        personKey: key.slice(0, key.lastIndexOf("|")),
        name,
        location,
        rolls,
        at: when?.at ?? null,
        since: when?.since ?? "",
      });
      return;
    }
    existing.rolls += rolls;
    if (existing.name === GUEST_NAME && name !== GUEST_NAME) existing.name = name;
    if (when && (existing.at === null || when.at < existing.at)) {
      existing.at = when.at;
      existing.since = when.since;
    }
  });

  const sorted = [...buckets.values()].sort((a, b) => {
    const byLocation = locationRank(a.location) - locationRank(b.location);
    if (byLocation !== 0) return byLocation;
    const aAt = a.at ?? Number.NEGATIVE_INFINITY;
    const bAt = b.at ?? Number.NEGATIVE_INFINITY;
    if (aAt !== bAt) return bAt - aAt;
    return a.name.localeCompare(b.name, "en");
  });

  const people = new Set<string>();
  let studioRolls = 0;
  let labRolls = 0;
  const rows: DepartureRow[] = [];
  for (const bucket of sorted) {
    people.add(bucket.personKey);
    if (bucket.location === "STUDIO") studioRolls += bucket.rolls;
    else labRolls += bucket.rolls;
    if (rows.length >= MAX_ROWS) continue;
    rows.push({
      name: bucket.name,
      rolls: bucket.rolls,
      location: bucket.location,
      status: statusFor(bucket.location, bucket.at, lastRunMs),
      since: bucket.since,
    });
  }

  return {
    rows,
    people: people.size,
    studioRolls,
    labRolls,
    nextLabRun: nextLabRunLabel(now),
  };
}

function wholeNumber(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > max) return null;
  return rounded;
}

function plainLabRun(value: unknown): string {
  if (typeof value !== "string") return "";
  const clean = value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (!clean || clean.includes("@")) return "";
  return clean;
}

const SINCE_PATTERN = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC) ([1-9]|[12]\d|3[01])$/;

function statusMatchesLocation(location: DepartureLocation, status: DepartureStatus): boolean {
  if (location === "STUDIO") return status === "CHECKED IN";
  return status === "IN FLIGHT" || status === "DEVELOPING";
}

function sanitizeRow(value: unknown): DepartureRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const name = boardName(row.name);
  if (!isSafeBoardName(name)) return null;
  const rolls = wholeNumber(row.rolls, 9999);
  if (rolls === null || rolls < 1) return null;
  const location = row.location;
  if (location !== "STUDIO" && location !== "LAB") return null;
  const status = row.status;
  if (status !== "CHECKED IN" && status !== "IN FLIGHT" && status !== "DEVELOPING") return null;
  if (!statusMatchesLocation(location, status)) return null;
  const since = typeof row.since === "string" && SINCE_PATTERN.test(row.since) ? row.since : "";
  return { name, rolls, location, status, since };
}

/** Rebuilds a departures object so only board fields can reach a public payload. */
export function sanitizeFilmDepartures(input: unknown): FilmDepartures | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const source = Array.isArray(record.rows) ? record.rows : [];
  const rows: DepartureRow[] = [];
  for (const item of source) {
    if (rows.length >= MAX_ROWS) break;
    const row = sanitizeRow(item);
    if (row) rows.push(row);
  }
  let studioRolls = 0;
  let labRolls = 0;
  for (const row of rows) {
    if (row.location === "STUDIO") studioRolls += row.rolls;
    else labRolls += row.rolls;
  }
  const people = wholeNumber(record.people, 100_000);
  const givenStudio = wholeNumber(record.studioRolls, 1_000_000);
  const givenLab = wholeNumber(record.labRolls, 1_000_000);
  return {
    rows,
    people: people ?? rows.length,
    studioRolls: givenStudio ?? studioRolls,
    labRolls: givenLab ?? labRolls,
    nextLabRun: plainLabRun(record.nextLabRun),
  };
}
