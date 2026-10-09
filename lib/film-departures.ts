/**
 * Public airport board for film that is still in process, plus film whose
 * scans were sent today.
 *
 * The display payload is unauthenticated. Names are first name plus last
 * initial only. Emails, phones, order numbers, and full last names never
 * leave this module. Flight codes are omitted so a hash cannot be walked
 * back to an order.
 *
 * DEPARTURES is film still at the studio (Received by Yours), waiting for
 * the next Tue/Fri noon lab run. ARRIVALS is film at the lab, plus orders
 * whose scans were sent today (LANDED). Those landed rows are today only.
 */

import { ORDER_STATUS } from "@/lib/constants";
import { FILM_METRICS_CONFIG } from "@/lib/film-metrics-config";
import {
  nextLabRunAt,
  nextLabRunBoardLabel,
  rollsOnOrder,
  shopClock,
  shopNoonUtc,
  type RollCountSource,
} from "@/lib/film-metrics";
import { getReceivedAtLabDate, getScansSentDate } from "@/lib/turnaround-time";
import type { FilmOrder } from "@/lib/types";
import { normalizeCustomerName } from "@/lib/validation";

export const DEPARTURE_STATUSES = ["CHECKED IN", "BOARDING", "FINAL CALL"] as const;
export type DepartureStatus = (typeof DEPARTURE_STATUSES)[number];

export const ARRIVAL_STATUSES = ["IN FLIGHT", "DELAYED", "LANDED"] as const;
export type ArrivalStatus = (typeof ARRIVAL_STATUSES)[number];

export interface DepartureRow {
  time: string;
  destination: "LAB";
  name: string;
  rolls: number;
  gate: string;
  status: DepartureStatus;
}

export interface ArrivalRow {
  from: "LAB";
  name: string;
  rolls: number;
  expected: string;
  status: ArrivalStatus;
}

export interface TurnaroundAverages {
  colorDays: number | null;
  bwDays: number | null;
}

export interface FilmDepartures {
  departures: DepartureRow[];
  arrivals: ArrivalRow[];
  nextLabRun: string;
  departureTime: string;
  people: number;
  studioRolls: number;
  labRolls: number;
  landedRolls: number;
}

/** Columns for the board query. No email, phone, notes, or order number. */
export const DEPARTURE_ORDER_SELECT = [
  "id",
  "customer_id",
  "customer_name",
  "status",
  "film_process",
  "roll_count",
  "roll_details",
  "received_by_yours_at",
  "at_lab_at",
  "dropoff_date",
  "created_at",
  "status_updated_at",
  "scans_sent_at",
  "color_scans_delivered_at",
  "bw_scans_delivered_at",
  "status_history",
].join(", ");

export interface DepartureOrder extends RollCountSource {
  id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  status?: string | null;
  film_process?: string | null;
  received_by_yours_at?: string | null;
  at_lab_at?: string | null;
  dropoff_date?: string | null;
  created_at?: string | null;
  status_updated_at?: string | null;
  scans_sent_at?: string | null;
  color_scans_delivered_at?: string | null;
  bw_scans_delivered_at?: string | null;
  status_history?: { status?: string | null; changed_at?: string | null }[] | null;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;
const MAX_ROWS = 500;
const MAX_NAME_LENGTH = 28;
const GUEST_NAME = "GUEST";
const FINAL_CALL_MS = 30 * 60 * 1000;
const BOARDING_MS = 3 * 60 * 60 * 1000;
const DATE_PATTERN = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC) ([1-9]|[12]\d|3[01])$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const LAB_RUN_PATTERN = /^(SUN|MON|TUE|WED|THU|FRI|SAT) (1[0-2]|[1-9]):[0-5]\d (AM|PM)$/;

const TITLES = new Set(["dr", "mr", "mrs", "ms", "miss", "mx", "prof"]);
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

interface When {
  at: number;
  label: string;
  key: string;
}

interface DepartureBucket {
  personKey: string;
  name: string;
  rolls: number;
  gate: string;
  gateAt: number | null;
}

interface ArrivalBucket {
  personKey: string;
  name: string;
  rolls: number;
  sentAt: number | null;
  days: number | null;
  landed: boolean;
}

function parseTimestamp(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(month: number, day: number): string {
  const label = MONTHS[month - 1];
  if (!label || day < 1 || day > 31) return "";
  return `${label} ${day}`;
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addCalendarDays(year: number, month: number, day: number, delta: number) {
  const shifted = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function fromInstant(value?: string | null): When | null {
  const date = parseTimestamp(value);
  if (!date) return null;
  const parts = shopClock(date);
  const label = formatDate(parts.month, parts.day);
  if (!label) return null;
  return { at: date.getTime(), label, key: parts.key };
}

function fromDropoff(value?: string | null): When | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const label = formatDate(month, day);
  if (!label) return null;
  return { at: shopNoonUtc(year, month, day).getTime(), label, key: value };
}

function firstWhen(...candidates: (When | null)[]): When | null {
  for (const candidate of candidates) {
    if (candidate) return candidate;
  }
  return null;
}

function labRunClock(): string {
  const { hour, minute } = FILM_METRICS_CONFIG.labRuns;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** CHECKED IN unless today's lab run is inside the boarding window. */
export function departureBoardStatus(now: Date): DepartureStatus {
  const next = nextLabRunAt(now);
  if (shopClock(now).key !== shopClock(next).key) return "CHECKED IN";
  const remaining = next.getTime() - now.getTime();
  if (remaining <= FINAL_CALL_MS) return "FINAL CALL";
  if (remaining <= BOARDING_MS) return "BOARDING";
  return "CHECKED IN";
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
 * First name plus the initial of the last word, uppercased.
 * One word stays whole ("CHER"). Two words are first plus last ("JUSTIN E.").
 * Middle names and initials are dropped, so only the first word is kept
 * ("TYLER H." from "Tyler L Henderson", not "TYLER L H.").
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
  const first = upper[0];
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

function personKey(order: DepartureOrder, index: number): string {
  const id = order.customer_id?.trim();
  if (id) return `id:${id}`;
  const name = normalizeCustomerName(order.customer_name ?? "");
  if (name) return `name:${name}`;
  const orderId = order.id?.trim();
  if (orderId) return `order:${orderId}`;
  return `row:${index}`;
}

function studioWhen(order: DepartureOrder): When | null {
  return firstWhen(
    fromInstant(order.received_by_yours_at),
    fromDropoff(order.dropoff_date),
    fromInstant(order.created_at),
    fromInstant(order.status_updated_at),
  );
}

function processToken(value: unknown): "color" | "bw" | "both" | "other" {
  if (typeof value !== "string") return "other";
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized === "color" || normalized === "c" || normalized === "c41") return "color";
  if (
    normalized.includes("blackandwhite")
    || normalized.includes("blackwhite")
    || normalized === "bw"
  ) {
    return "bw";
  }
  if (normalized === "both") return "both";
  return "other";
}

function orderKind(order: DepartureOrder): "color" | "bw" | "mixed" {
  const kinds = new Set<"color" | "bw" | "both">();
  if (Array.isArray(order.roll_details)) {
    for (const roll of order.roll_details) {
      if (!roll || typeof roll !== "object" || !("film_process" in roll)) continue;
      const kind = processToken((roll as { film_process?: unknown }).film_process);
      if (kind !== "other") kinds.add(kind);
    }
  }
  if (kinds.size === 0) {
    const kind = processToken(order.film_process);
    if (kind !== "other") kinds.add(kind);
  }
  if (kinds.size === 1 && kinds.has("color")) return "color";
  if (kinds.size === 1 && kinds.has("bw")) return "bw";
  return "mixed";
}

function finiteDays(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function daysFor(order: DepartureOrder, averages: TurnaroundAverages): number | null {
  const color = finiteDays(averages.colorDays);
  const bw = finiteDays(averages.bwDays);
  const kind = orderKind(order);
  if (kind === "color") return color;
  if (kind === "bw") return bw;
  const values = [color, bw].filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return Math.max(...values);
}

function sentToLab(order: DepartureOrder): Date | null {
  const fromLab = getReceivedAtLabDate(order as FilmOrder);
  if (fromLab) return fromLab;
  const direct = parseTimestamp(order.status_updated_at)
    ?? parseTimestamp(order.received_by_yours_at)
    ?? parseTimestamp(order.created_at);
  if (direct) return direct;
  const dropoff = fromDropoff(order.dropoff_date);
  return dropoff ? new Date(dropoff.at) : null;
}

function expectedFrom(sentAt: number | null, days: number | null): { label: string; key: string | null } {
  if (sentAt === null || days === null) return { label: "--", key: null };
  const sent = shopClock(new Date(sentAt));
  const shifted = addCalendarDays(sent.year, sent.month, sent.day, Math.ceil(days));
  const label = formatDate(shifted.month, shifted.day);
  if (!label) return { label: "--", key: null };
  return { label, key: dateKey(shifted.year, shifted.month, shifted.day) };
}

function scansSentToday(order: DepartureOrder, todayKey: string): boolean {
  if (order.status !== ORDER_STATUS.SCANS_SENT) return false;
  const sent = getScansSentDate(order as FilmOrder);
  if (!sent) return false;
  return shopClock(sent).key === todayKey;
}

function rememberName(bucket: { name: string }, name: string) {
  if (bucket.name === GUEST_NAME && name !== GUEST_NAME) bucket.name = name;
}

function arrivalRank(status: ArrivalStatus): number {
  if (status === "LANDED") return 0;
  if (status === "DELAYED") return 1;
  return 2;
}

export function computeFilmDepartures(
  orders: readonly DepartureOrder[],
  now = new Date(),
  averages: TurnaroundAverages = { colorDays: null, bwDays: null },
): FilmDepartures {
  const todayKey = shopClock(now).key;
  const status = departureBoardStatus(now);
  const time = labRunClock();
  const departures = new Map<string, DepartureBucket>();
  const arrivals = new Map<string, ArrivalBucket>();

  orders.forEach((order, index) => {
    const key = personKey(order, index);
    const name = boardName(order.customer_name);
    const rolls = rollsOnOrder(order);

    if (order.status === ORDER_STATUS.RECEIVED_BY_YOURS) {
      const when = studioWhen(order);
      const existing = departures.get(key);
      if (!existing) {
        departures.set(key, {
          personKey: key,
          name,
          rolls,
          gate: when?.label || "Y1",
          gateAt: when?.at ?? null,
        });
        return;
      }
      existing.rolls += rolls;
      rememberName(existing, name);
      if (when && (existing.gateAt === null || when.at < existing.gateAt)) {
        existing.gateAt = when.at;
        existing.gate = when.label;
      }
      return;
    }

    const landed = scansSentToday(order, todayKey);
    if (order.status !== ORDER_STATUS.RECEIVED_AT_LAB && !landed) return;

    const sent = sentToLab(order);
    const bucketKey = `${key}|${landed ? "landed" : "lab"}`;
    const existing = arrivals.get(bucketKey);
    const days = daysFor(order, averages);
    if (!existing) {
      arrivals.set(bucketKey, {
        personKey: key,
        name,
        rolls,
        sentAt: sent ? sent.getTime() : null,
        days,
        landed,
      });
      return;
    }
    existing.rolls += rolls;
    rememberName(existing, name);
    if (sent && (existing.sentAt === null || sent.getTime() < existing.sentAt)) {
      existing.sentAt = sent.getTime();
      existing.days = days;
    }
  });

  const departureRows = [...departures.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "en") || a.personKey.localeCompare(b.personKey))
    .slice(0, MAX_ROWS)
    .map((bucket): DepartureRow => ({
      time,
      destination: "LAB",
      name: bucket.name,
      rolls: bucket.rolls,
      gate: bucket.gate,
      status,
    }));

  const arrivalRows = [...arrivals.values()]
    .map((bucket) => {
      const expected = expectedFrom(bucket.sentAt, bucket.days);
      const arrivalStatus: ArrivalStatus = bucket.landed
        ? "LANDED"
        : expected.key !== null && todayKey > expected.key
          ? "DELAYED"
          : "IN FLIGHT";
      return { bucket, expected, arrivalStatus };
    })
    .sort((a, b) => {
      const byStatus = arrivalRank(a.arrivalStatus) - arrivalRank(b.arrivalStatus);
      if (byStatus !== 0) return byStatus;
      const aKey = a.expected.key ?? "9999-99-99";
      const bKey = b.expected.key ?? "9999-99-99";
      if (aKey !== bKey) return aKey < bKey ? -1 : 1;
      return a.bucket.name.localeCompare(b.bucket.name, "en")
        || a.bucket.personKey.localeCompare(b.bucket.personKey);
    })
    .slice(0, MAX_ROWS)
    .map((row): ArrivalRow => ({
      from: "LAB",
      name: row.bucket.name,
      rolls: row.bucket.rolls,
      expected: row.expected.label,
      status: row.arrivalStatus,
    }));

  const people = new Set<string>();
  let studioRolls = 0;
  let labRolls = 0;
  let landedRolls = 0;
  for (const bucket of departures.values()) {
    people.add(bucket.personKey);
    studioRolls += bucket.rolls;
  }
  for (const bucket of arrivals.values()) {
    people.add(bucket.personKey);
    if (bucket.landed) landedRolls += bucket.rolls;
    else labRolls += bucket.rolls;
  }

  return {
    departures: departureRows,
    arrivals: arrivalRows,
    nextLabRun: nextLabRunBoardLabel(now),
    departureTime: time,
    people: people.size,
    studioRolls,
    labRolls,
    landedRolls,
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
  const clean = value.replace(/<[^>]*>/g, "").replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
  return LAB_RUN_PATTERN.test(clean) ? clean : "";
}

function gateValue(value: unknown): string {
  if (value === "Y1") return "Y1";
  if (typeof value === "string" && DATE_PATTERN.test(value)) return value;
  return "";
}

function expectedValue(value: unknown): string {
  if (value === "--") return "--";
  if (typeof value === "string" && DATE_PATTERN.test(value)) return value;
  return "";
}

function sanitizeDeparture(value: unknown): DepartureRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const name = boardName(row.name);
  if (!isSafeBoardName(name)) return null;
  const rolls = wholeNumber(row.rolls, 9999);
  if (rolls === null || rolls < 1) return null;
  if (typeof row.time !== "string" || !TIME_PATTERN.test(row.time)) return null;
  if (row.destination !== "LAB") return null;
  const gate = gateValue(row.gate);
  if (!gate) return null;
  const status = row.status;
  if (status !== "CHECKED IN" && status !== "BOARDING" && status !== "FINAL CALL") return null;
  return { time: row.time, destination: "LAB", name, rolls, gate, status };
}

function sanitizeArrival(value: unknown): ArrivalRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const name = boardName(row.name);
  if (!isSafeBoardName(name)) return null;
  const rolls = wholeNumber(row.rolls, 9999);
  if (rolls === null || rolls < 1) return null;
  if (row.from !== "LAB") return null;
  const expected = expectedValue(row.expected);
  if (!expected) return null;
  const status = row.status;
  if (status !== "IN FLIGHT" && status !== "DELAYED" && status !== "LANDED") return null;
  return { from: "LAB", name, rolls, expected, status };
}

function takeRows<T>(source: unknown, sanitize: (value: unknown) => T | null): T[] {
  if (!Array.isArray(source)) return [];
  const rows: T[] = [];
  for (const item of source) {
    if (rows.length >= MAX_ROWS) break;
    const row = sanitize(item);
    if (row) rows.push(row);
  }
  return rows;
}

/** Rebuilds a board so only public fields can reach a display payload. */
export function sanitizeFilmDepartures(input: unknown): FilmDepartures | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const departures = takeRows(record.departures, sanitizeDeparture);
  const arrivals = takeRows(record.arrivals, sanitizeArrival);
  let studioRolls = 0;
  let labRolls = 0;
  let landedRolls = 0;
  for (const row of departures) studioRolls += row.rolls;
  for (const row of arrivals) {
    if (row.status === "LANDED") landedRolls += row.rolls;
    else labRolls += row.rolls;
  }
  const people = wholeNumber(record.people, 100_000);
  const givenStudio = wholeNumber(record.studioRolls, 1_000_000);
  const givenLab = wholeNumber(record.labRolls, 1_000_000);
  const givenLanded = wholeNumber(record.landedRolls, 1_000_000);
  const departureTime = typeof record.departureTime === "string" && TIME_PATTERN.test(record.departureTime)
    ? record.departureTime
    : departures[0]?.time ?? "";
  return {
    departures,
    arrivals,
    nextLabRun: plainLabRun(record.nextLabRun),
    departureTime,
    people: people ?? new Set([...departures, ...arrivals].map((row) => row.name)).size,
    studioRolls: givenStudio ?? studioRolls,
    labRolls: givenLab ?? labRolls,
    landedRolls: givenLanded ?? landedRolls,
  };
}
