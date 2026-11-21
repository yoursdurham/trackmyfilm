import { isValidEmail, normalizeEmail } from "@/lib/validation";
import { FILM_TYPES } from "@/lib/validation";
import {
  FILTER_FIELDS,
  ORDER_STATUS_OPTIONS,
  type Condition,
  type FilterNode,
  type MarketingOrder,
  type MarketingPerson,
  type SubscriptionStatus,
  type SuppressionReason,
} from "@/lib/marketing/types";

const FIELD_TYPES = new Set(FILTER_FIELDS.map((field) => field.type));
const FILM_TYPE_SET = new Set<string>(FILM_TYPES);
const STATUS_SET = new Set<string>(ORDER_STATUS_OPTIONS);
const PROCESS_SET = new Set(["Color", "Black & White", "Both"]);

export type CustomerRow = {
  id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  created_at?: string | null;
  total_dropoffs?: number | null;
  total_rolls?: number | null;
  last_dropoff_date?: string | null;
};

export type OrderRow = {
  id: string;
  customer_id?: string | null;
  customer_email?: string | null;
  status?: string | null;
  dropoff_date?: string | null;
  created_at?: string | null;
  scans_sent_at?: string | null;
  received_by_yours_at?: string | null;
  at_lab_at?: string | null;
  film_type?: string | null;
  film_process?: string | null;
  film_stock?: string | null;
  roll_details?: unknown;
};

export type AuthAccount = { email: string; createdAt: string };
export type PhotoRow = { email?: string | null };
export type SubscriptionRow = {
  email: string;
  customer_id?: string | null;
  status: "subscribed" | "unsubscribed" | "suppressed";
  suppression_reason?: string | null;
  consented_at?: string | null;
};

export type AccountDirectory =
  | { state: "ready"; users: AuthAccount[] }
  | { state: "unavailable"; reason: string };

function stringsFromRolls(rollDetails: unknown, key: "film_type" | "film_process" | "film_stock"): string[] {
  if (!Array.isArray(rollDetails)) return [];
  const values: string[] = [];
  for (const roll of rollDetails) {
    if (!roll || typeof roll !== "object") continue;
    const value = (roll as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) values.push(value.trim());
  }
  return values;
}

export function orderFact(row: OrderRow): MarketingOrder {
  const filmTypes = [row.film_type, ...stringsFromRolls(row.roll_details, "film_type")].filter(
    (value): value is string => Boolean(value && value.trim()),
  );
  const filmProcesses = [row.film_process, ...stringsFromRolls(row.roll_details, "film_process")].filter(
    (value): value is string => Boolean(value && value.trim()),
  );
  const filmStocks = [row.film_stock, ...stringsFromRolls(row.roll_details, "film_stock")].filter(
    (value): value is string => Boolean(value && value.trim()),
  );
  return {
    id: row.id,
    status: row.status ?? "",
    dropoffDate: row.dropoff_date ?? null,
    createdAt: row.created_at ?? null,
    scansSentAt: row.scans_sent_at ?? null,
    receivedAt: row.received_by_yours_at ?? null,
    atLabAt: row.at_lab_at ?? null,
    filmTypes,
    filmProcesses,
    filmStocks,
  };
}

function suppressionReason(value: string | null | undefined): SuppressionReason | null {
  if (value === "bounced" || value === "complained" || value === "invalid" || value === "manual") return value;
  return null;
}

/**
 * One person per email. Customer rows, orders, auth users, photos, and
 * subscription rows join on the normalized address. An account or an order
 * does not create a subscription.
 */
export function buildPeople(input: {
  customers: CustomerRow[];
  orders: OrderRow[];
  accounts: AccountDirectory;
  photos: PhotoRow[];
  subscriptions: SubscriptionRow[];
}): MarketingPerson[] {
  const byEmail = new Map<string, MarketingPerson>();

  const ensure = (email: string): MarketingPerson | null => {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const existing = byEmail.get(normalized);
    if (existing) return existing;
    const created: MarketingPerson = {
      customerId: null,
      email: normalized,
      firstName: "",
      lastName: "",
      customerCreatedAt: null,
      accountCreatedAt: null,
      totalDropoffs: 0,
      totalRolls: 0,
      lastDropoffDate: null,
      orders: [],
      photoCount: 0,
      subscriptionStatus: "none",
      suppressionReason: null,
      consentedAt: null,
      emailValid: isValidEmail(normalized),
    };
    byEmail.set(normalized, created);
    return created;
  };

  for (const customer of input.customers) {
    if (!customer.email) continue;
    const person = ensure(customer.email);
    if (!person) continue;
    person.customerId = customer.id;
    person.firstName = customer.first_name?.trim() ?? "";
    person.lastName = customer.last_name?.trim() ?? "";
    person.customerCreatedAt = customer.created_at ?? null;
    person.totalDropoffs = customer.total_dropoffs ?? 0;
    person.totalRolls = customer.total_rolls ?? 0;
    person.lastDropoffDate = customer.last_dropoff_date ?? null;
  }

  const ordersByCustomer = new Map<string, MarketingOrder[]>();
  for (const row of input.orders) {
    const fact = orderFact(row);
    if (row.customer_id) {
      const list = ordersByCustomer.get(row.customer_id) ?? [];
      list.push(fact);
      ordersByCustomer.set(row.customer_id, list);
    }
    if (!row.customer_email) continue;
    const person = ensure(row.customer_email);
    if (!person) continue;
    if (!person.orders.some((order) => order.id === fact.id)) person.orders.push(fact);
  }

  for (const person of byEmail.values()) {
    if (!person.customerId) continue;
    const linked = ordersByCustomer.get(person.customerId) ?? [];
    for (const order of linked) {
      if (!person.orders.some((existing) => existing.id === order.id)) person.orders.push(order);
    }
    if (!person.lastDropoffDate) {
      const dates = person.orders.map((order) => order.dropoffDate).filter((date): date is string => Boolean(date));
      dates.sort();
      person.lastDropoffDate = dates.at(-1) ?? null;
    }
  }

  if (input.accounts.state === "ready") {
    for (const account of input.accounts.users) {
      const person = ensure(account.email);
      if (!person) continue;
      if (!person.accountCreatedAt || account.createdAt < person.accountCreatedAt) {
        person.accountCreatedAt = account.createdAt;
      }
    }
  }

  for (const photo of input.photos) {
    if (!photo.email) continue;
    const person = ensure(photo.email);
    if (!person) continue;
    person.photoCount += 1;
  }

  for (const subscription of input.subscriptions) {
    const person = ensure(subscription.email);
    if (!person) continue;
    person.subscriptionStatus = subscription.status;
    person.suppressionReason = suppressionReason(subscription.suppression_reason);
    person.consentedAt = subscription.consented_at ?? null;
    if (subscription.customer_id && !person.customerId) person.customerId = subscription.customer_id;
  }

  return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
}

export function daysSince(dateIso: string | null, now: Date): number | null {
  if (!dateIso) return null;
  const parsed = Date.parse(dateIso.length === 10 ? `${dateIso}T12:00:00.000Z` : dateIso);
  if (Number.isNaN(parsed)) return null;
  return Math.floor((now.getTime() - parsed) / 86_400_000);
}

function compare(left: number, op: CompareOp, right: number): boolean {
  if (op === "gte") return left >= right;
  if (op === "lte") return left <= right;
  return left === right;
}

type CompareOp = "gte" | "lte" | "eq";

function firstScansAt(person: MarketingPerson): string | null {
  const stamps = person.orders.map((order) => order.scansSentAt).filter((value): value is string => Boolean(value));
  stamps.sort();
  return stamps[0] ?? null;
}

function scansWereSent(order: MarketingOrder): boolean {
  return Boolean(order.scansSentAt) || order.status === "Scans Sent";
}

export function matchesCondition(person: MarketingPerson, condition: Condition, now: Date): boolean {
  switch (condition.type) {
    case "has_account":
      return Boolean(person.accountCreatedAt) === condition.value;
    case "no_account_with_dropoff":
      return person.orders.length > 0 && !person.accountCreatedAt;
    case "total_dropoffs":
      return compare(person.totalDropoffs, condition.op, condition.value);
    case "total_rolls":
      return compare(person.totalRolls, condition.op, condition.value);
    case "days_since_last_dropoff": {
      const days = daysSince(person.lastDropoffDate, now);
      if (days === null) return false;
      return compare(days, condition.op, condition.value);
    }
    case "ever_status":
      return person.orders.some((order) => order.status === condition.value);
    case "film_type":
      return person.orders.some((order) => order.filmTypes.includes(condition.value));
    case "film_process":
      return person.orders.some((order) => order.filmProcesses.includes(condition.value));
    case "film_stock_contains": {
      const needle = condition.value.trim().toLowerCase();
      if (!needle) return false;
      return person.orders.some((order) => order.filmStocks.some((stock) => stock.toLowerCase().includes(needle)));
    }
    case "has_photo":
      return (person.photoCount > 0) === condition.value;
    case "scans_sent":
      return person.orders.some(scansWereSent) === condition.value;
    case "days_since_first_scans": {
      const days = daysSince(firstScansAt(person), now);
      if (days === null) return false;
      return compare(days, condition.op, condition.value);
    }
    default:
      return false;
  }
}

export function matchesFilter(person: MarketingPerson, filter: FilterNode, now: Date): boolean {
  if (filter.op === "condition") return matchesCondition(person, filter.condition, now);
  if (filter.op === "and") return filter.children.every((child) => matchesFilter(person, child, now));
  return filter.children.some((child) => matchesFilter(person, child, now));
}

export function exclusionReasons(person: MarketingPerson): string[] {
  const reasons: string[] = [];
  if (!person.emailValid) reasons.push("Invalid email address");
  if (person.subscriptionStatus === "none") reasons.push("No marketing consent");
  if (person.subscriptionStatus === "unsubscribed") reasons.push("Unsubscribed");
  if (person.subscriptionStatus === "suppressed") {
    if (person.suppressionReason === "bounced") reasons.push("Bounced");
    else if (person.suppressionReason === "complained") reasons.push("Complained");
    else if (person.suppressionReason === "invalid") reasons.push("Marked invalid");
    else reasons.push("Suppressed");
  }
  if (person.subscriptionStatus === "subscribed" && !person.consentedAt) {
    reasons.push("No marketing consent");
  }
  return reasons;
}

export type AudienceSelection = {
  recipients: MarketingPerson[];
  excluded: { person: MarketingPerson; reasons: string[] }[];
};

/**
 * Consent is applied after the filter and cannot be skipped.
 * An empty AND matches every loaded person, then exclusions remove
 * anyone who did not ask for marketing email.
 */
export function selectAudience(people: MarketingPerson[], filter: FilterNode, now: Date): AudienceSelection {
  const recipients: MarketingPerson[] = [];
  const excluded: AudienceSelection["excluded"] = [];
  for (const person of people) {
    if (!matchesFilter(person, filter, now)) continue;
    const reasons = exclusionReasons(person);
    if (reasons.length === 0) recipients.push(person);
    else excluded.push({ person, reasons });
  }
  return { recipients, excluded };
}

export function filterNeedsAccounts(filter: FilterNode): boolean {
  if (filter.op === "condition") {
    return filter.condition.type === "has_account" || filter.condition.type === "no_account_with_dropoff";
  }
  return filter.children.some(filterNeedsAccounts);
}

export function filterNeedsPhotos(filter: FilterNode): boolean {
  if (filter.op === "condition") return filter.condition.type === "has_photo";
  return filter.children.some(filterNeedsPhotos);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseCondition(value: unknown): Condition | { error: string } {
  if (!isRecord(value) || typeof value.type !== "string") return { error: "A filter condition needs a type." };
  if (!FIELD_TYPES.has(value.type as Condition["type"])) {
    return { error: `“${value.type}” is not a supported filter. Marketing filters only use data TrackMyFilm already stores.` };
  }
  const type = value.type as Condition["type"];
  if (type === "no_account_with_dropoff") return { type };
  if (type === "has_account" || type === "has_photo" || type === "scans_sent") {
    if (typeof value.value !== "boolean") return { error: `${type} needs a yes or no value.` };
    return { type, value: value.value } as Condition;
  }
  if (type === "ever_status") {
    if (typeof value.value !== "string" || !STATUS_SET.has(value.value)) {
      return { error: "Choose a real order status." };
    }
    return { type, value: value.value as (typeof ORDER_STATUS_OPTIONS)[number] };
  }
  if (type === "film_type") {
    if (typeof value.value !== "string" || !FILM_TYPE_SET.has(value.value)) {
      return { error: "Choose a film format the shop already uses." };
    }
    return { type, value: value.value as (typeof FILM_TYPES)[number] };
  }
  if (type === "film_process") {
    if (typeof value.value !== "string" || !PROCESS_SET.has(value.value)) {
      return { error: "Choose Color, Black & White, or Both." };
    }
    return { type, value: value.value as "Color" | "Black & White" | "Both" };
  }
  if (type === "film_stock_contains") {
    if (typeof value.value !== "string" || !value.value.trim()) return { error: "Enter a film stock name to look for." };
    return { type, value: value.value.trim().slice(0, 80) };
  }
  const op = value.op;
  const amount = value.value;
  if ((type === "days_since_last_dropoff" || type === "days_since_first_scans") && op !== "gte" && op !== "lte") {
    return { error: "Choose at least or at most for a day count." };
  }
  if ((type === "total_dropoffs" || type === "total_rolls") && op !== "gte" && op !== "lte" && op !== "eq") {
    return { error: "Choose a comparison for the count." };
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 100000) {
    return { error: "Enter a count or a number of days." };
  }
  if (type === "total_dropoffs" || type === "total_rolls") {
    return { type, op: op as CompareOp, value: amount };
  }
  if (type === "days_since_last_dropoff" || type === "days_since_first_scans") {
    return { type, op: op as "gte" | "lte", value: amount };
  }
  return { error: "That filter is not supported." };
}

export function parseFilter(value: unknown): FilterNode | { error: string } {
  if (!isRecord(value) || (value.op !== "and" && value.op !== "or" && value.op !== "condition")) {
    return { error: "A filter needs and, or, or a condition." };
  }
  if (value.op === "condition") {
    const condition = parseCondition(value.condition);
    if ("error" in condition) return condition;
    return { op: "condition", condition };
  }
  if (!Array.isArray(value.children)) return { error: "A filter group needs a list of conditions." };
  if (value.children.length > 30) return { error: "Use 30 conditions or fewer." };
  const children: FilterNode[] = [];
  for (const child of value.children) {
    const parsed = parseFilter(child);
    if ("error" in parsed) return parsed;
    children.push(parsed);
  }
  return { op: value.op, children };
}

export function emptyAndFilter(): FilterNode {
  return { op: "and", children: [] };
}

export type ConsentUpdate =
  | { ok: true; status: Exclude<SubscriptionStatus, "none">; reason: SuppressionReason | null }
  | { ok: false; error: string };

/** Subscribing requires an explicit confirmation. An account or an order is not confirmation. */
export function consentUpdate(input: { status: unknown; explicit: unknown; reason?: unknown }): ConsentUpdate {
  if (input.status === "subscribed") {
    if (input.explicit !== true) {
      return { ok: false, error: "Subscribing requires confirmation that this person asked for marketing email." };
    }
    return { ok: true, status: "subscribed", reason: null };
  }
  if (input.status === "unsubscribed") return { ok: true, status: "unsubscribed", reason: null };
  if (input.status === "suppressed") {
    const reason = input.reason === "bounced" || input.reason === "complained" || input.reason === "invalid" || input.reason === "manual"
      ? input.reason
      : "manual";
    return { ok: true, status: "suppressed", reason };
  }
  return { ok: false, error: "Choose subscribed, unsubscribed, or suppressed." };
}
