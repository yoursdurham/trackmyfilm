import { exclusionReasons, matchesFilter } from "@/lib/marketing/audience";
import { frequencyCapBlocks, type FrequencyCap } from "@/lib/marketing/delivery";
import type { AutomationDefinition, ExitKind, MarketingPerson, Trigger } from "@/lib/marketing/types";

export type EnrollmentRecord = {
  email: string;
  generation: number;
  status: "waiting" | "sent" | "exited" | "failed";
  enrolledAt: string;
  sentAt: string | null;
};

export type NewEnrollment = {
  email: string;
  customerId: string | null;
  eventAt: string;
  dueAt: string;
  generation: number;
};

function addHours(iso: string, hours: number): string {
  const parsed = Date.parse(iso);
  return new Date(parsed + hours * 3_600_000).toISOString();
}

function orderTime(order: { createdAt: string | null; dropoffDate: string | null; receivedAt: string | null }): string | null {
  return order.createdAt ?? order.receivedAt ?? (order.dropoffDate ? `${order.dropoffDate}T12:00:00.000Z` : null);
}

/** The qualifying event, or null when this person should not enter. */
export function triggerEvent(person: MarketingPerson, trigger: Trigger, activatedAt: string, now: Date): { at: string } | null {
  const activated = Date.parse(activatedAt);
  if (Number.isNaN(activated)) return null;

  if (trigger.type === "account_created") {
    if (!person.accountCreatedAt) return null;
    if (Date.parse(person.accountCreatedAt) <= activated) return null;
    return { at: person.accountCreatedAt };
  }

  if (trigger.type === "dropoff_without_account") {
    if (person.accountCreatedAt) return null;
    const times = person.orders.map(orderTime).filter((value): value is string => value !== null && Date.parse(value) > activated);
    times.sort();
    const first = times[0];
    return first ? { at: first } : null;
  }

  if (trigger.type === "first_scans_sent") {
    const stamps = person.orders.map((order) => order.scansSentAt).filter((value): value is string => Boolean(value));
    stamps.sort();
    const first = stamps[0];
    if (!first || Date.parse(first) <= activated) return null;
    return { at: first };
  }

  if (trigger.type === "inactive") {
    if (!person.lastDropoffDate) return null;
    const dropped = Date.parse(`${person.lastDropoffDate}T23:59:59.000Z`);
    if (Number.isNaN(dropped)) return null;
    const crossed = dropped + trigger.days * 86_400_000;
    if (crossed <= activated || crossed > now.getTime()) return null;
    return { at: new Date(crossed).toISOString() };
  }

  const dated = person.orders
    .map((order) => orderTime(order))
    .filter((value): value is string => Boolean(value))
    .sort();
  const before = dated.filter((stamp) => Date.parse(stamp) <= activated).length;
  if (before >= trigger.dropoffs) return null;
  const crossing = dated[trigger.dropoffs - 1];
  if (!crossing || Date.parse(crossing) <= activated) return null;
  return { at: crossing };
}

export function enrollmentCandidates(input: {
  automation: AutomationDefinition;
  people: MarketingPerson[];
  existing: EnrollmentRecord[];
  now: Date;
}): NewEnrollment[] {
  if (input.automation.status !== "active" || !input.automation.activatedAt) return [];
  const byEmail = new Map<string, EnrollmentRecord[]>();
  for (const row of input.existing) {
    const list = byEmail.get(row.email) ?? [];
    list.push(row);
    byEmail.set(row.email, list);
  }
  const created: NewEnrollment[] = [];
  for (const person of input.people) {
    if (exclusionReasons(person).length > 0) continue;
    if (!matchesFilter(person, input.automation.eligibility, input.now)) continue;
    const event = triggerEvent(person, input.automation.trigger, input.automation.activatedAt, input.now);
    if (!event) continue;
    const prior = byEmail.get(person.email) ?? [];
    if (prior.some((row) => row.status === "waiting")) continue;
    if (prior.length > 0 && input.automation.reentry === "never") continue;
    if (prior.length > 0 && input.automation.reentry === "after_cooldown") {
      const latest = prior
        .map((row) => Date.parse(row.sentAt ?? row.enrolledAt))
        .filter((value) => !Number.isNaN(value))
        .sort((a, b) => b - a)[0];
      if (latest !== undefined && input.now.getTime() - latest < input.automation.cooldownDays * 86_400_000) continue;
    }
    const generation = prior.reduce((max, row) => Math.max(max, row.generation), 0) + 1;
    created.push({
      email: person.email,
      customerId: person.customerId,
      eventAt: event.at,
      dueAt: addHours(event.at, input.automation.delayHours),
      generation,
    });
  }
  return created;
}

export type Recheck =
  | { action: "send" }
  | { action: "exit"; reason: string }
  | { action: "wait"; reason: string };

export function recheckBeforeSend(input: {
  automation: Pick<AutomationDefinition, "status" | "eligibility" | "exits" | "cooldownDays">;
  person: MarketingPerson;
  dueAt: string;
  enrolledAt: string;
  now: Date;
  marketingSentAt: string[];
  cap: FrequencyCap;
}): Recheck {
  if (input.automation.status !== "active") return { action: "wait", reason: "Automation is not active." };
  if (Date.parse(input.dueAt) > input.now.getTime()) return { action: "wait", reason: "Delay has not finished." };
  const reasons = exclusionReasons(input.person);
  if (reasons.length > 0) return { action: "exit", reason: reasons.join(", ") };
  if (!matchesFilter(input.person, input.automation.eligibility, input.now)) {
    return { action: "exit", reason: "No longer matches the audience." };
  }
  const exitReason = exitReasonFor(input.automation.exits, input.person, input.enrolledAt);
  if (exitReason) return { action: "exit", reason: exitReason };
  if (frequencyCapBlocks(input.marketingSentAt, input.now, input.cap)) {
    return { action: "wait", reason: "Frequency cap." };
  }
  const last = input.marketingSentAt
    .map((stamp) => Date.parse(stamp))
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => b - a)[0];
  if (last !== undefined && input.now.getTime() - last < input.automation.cooldownDays * 86_400_000) {
    return { action: "wait", reason: "Cooldown." };
  }
  return { action: "send" };
}

function exitReasonFor(exits: ExitKind[], person: MarketingPerson, enrolledAt: string): string | null {
  if (exits.includes("created_account") && person.accountCreatedAt && Date.parse(person.accountCreatedAt) > Date.parse(enrolledAt)) {
    return "Created an account.";
  }
  if (exits.includes("new_dropoff")) {
    const enrolled = Date.parse(enrolledAt);
    const newer = person.orders.some((order) => {
      const stamp = order.createdAt ?? (order.dropoffDate ? `${order.dropoffDate}T12:00:00.000Z` : null);
      return stamp !== null && Date.parse(stamp) > enrolled;
    });
    if (newer) return "New drop-off.";
  }
  return null;
}

export function parseTrigger(value: unknown): Trigger | { error: string } {
  if (!value || typeof value !== "object") return { error: "Choose a trigger." };
  const type = (value as { type?: unknown }).type;
  if (type === "account_created" || type === "dropoff_without_account" || type === "first_scans_sent") return { type };
  if (type === "inactive") {
    const days = (value as { days?: unknown }).days;
    if (typeof days !== "number" || !Number.isInteger(days) || days < 14 || days > 3650) {
      return { error: "Inactivity needs a number of days between 14 and 3650." };
    }
    return { type, days };
  }
  if (type === "dropoff_milestone") {
    const dropoffs = (value as { dropoffs?: unknown }).dropoffs;
    if (typeof dropoffs !== "number" || !Number.isInteger(dropoffs) || dropoffs < 2 || dropoffs > 10000) {
      return { error: "A milestone needs a drop-off count of at least 2." };
    }
    return { type, dropoffs };
  }
  return { error: "That trigger is not based on an event TrackMyFilm records." };
}

export function parseExits(value: unknown): ExitKind[] | { error: string } {
  if (!Array.isArray(value)) return { error: "Exit conditions need to be a list." };
  const exits: ExitKind[] = [];
  for (const item of value) {
    if (item === "created_account" || item === "new_dropoff") exits.push(item);
    else return { error: "An exit condition is not supported." };
  }
  return exits;
}

