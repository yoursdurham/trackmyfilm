import { isBlankRoll, orderHasOnlyBlankRolls } from "@/lib/blank-roll";
import { formatMiles, MILES_PER_DROPOFF } from "@/lib/miles-saved";
import { computeCustomerEmailStats, type CustomerEmailStats } from "@/lib/customer-email-stats";
import { ORDER_STATUS, KNOWN_ORDER_STATUSES } from "@/lib/constants";
import { filmProductUrl } from "@/lib/film-product-links";
import { recommendNewFilms, type FilmRecommendation } from "@/lib/film-recommendations";
import { correctFilmStockSpelling } from "@/lib/film-stocks";
import { isScansOnlyOrder } from "@/lib/order-service";
import { PUBLIC_ON_HOLD_MESSAGE, publicTimelineStatus } from "@/lib/tracking-public";
import type { FilmOrder, FilmType, OrderStatus, RollDetail } from "@/lib/types";
import { emailsMatchExact } from "@/lib/validation";

export const ACCOUNT_PROGRESS_LABELS = ["Dropped off", "At lab", "Scans sent"] as const;

export const ACCOUNT_ON_HOLD_MESSAGE = PUBLIC_ON_HOLD_MESSAGE;

const FAVORITE_LIMIT = 4;

export type AccountOrderInput = {
  id: string;
  order_number: string;
  customer_name?: string | null;
  customer_email?: string | null;
  status?: string | null;
  status_history?: { status?: string | null; changed_at?: string | null }[] | null;
  film_type?: string | null;
  film_stock?: string | null;
  roll_count?: number | null;
  roll_details?: RollDetail[] | null;
  dropoff_date?: string | null;
  dropoff_number?: number | null;
  wetransfer_link?: string | null;
  color_scans_wetransfer_link?: string | null;
  bw_scans_wetransfer_link?: string | null;
  scan_notes?: string | null;
  received_by_yours_at?: string | null;
  scans_sent_at?: string | null;
  created_at?: string | null;
};

export type AccountRollPill = {
  stock: string;
  format: string | null;
};

export type AccountDownload = {
  label: string;
  href: string;
};

export type AccountProgressStep = {
  label: (typeof ACCOUNT_PROGRESS_LABELS)[number];
  reached: boolean;
};

export type AccountOrderView = {
  id: string;
  orderNumber: string;
  dateLabel: string | null;
  onHold: boolean;
  holdMessage: string | null;
  steps: AccountProgressStep[];
  rolls: AccountRollPill[];
  downloads: AccountDownload[];
  scanNotes: string | null;
};

export type AccountFavorite = {
  stock: string;
  href: string | null;
};

export type AccountProfileData = {
  greetingName: string;
  email: string;
  contactName: string | null;
  stats: CustomerEmailStats;
  milesSaved: string;
  current: AccountOrderView[];
  history: AccountOrderView[];
  favorites: AccountFavorite[];
  recommendations: FilmRecommendation[];
};

/**
 * One of this customer's drop-offs is one round trip to Raleigh they did not
 * drive. Orders whose rolls are all blank do not count. The 32 miles match
 * the homepage and studio figure.
 */
export function accountMilesSaved(orders: Pick<AccountOrderInput, "id" | "roll_details">[]): string {
  const seen = new Set<string>();
  let dropoffs = 0;
  for (const order of orders) {
    if (seen.has(order.id)) continue;
    seen.add(order.id);
    if (orderHasOnlyBlankRolls({ roll_details: order.roll_details ?? undefined })) continue;
    dropoffs += 1;
  }
  return `${formatMiles(dropoffs * MILES_PER_DROPOFF)} mi`;
}

export function isAccountPreview(preview: string | undefined, nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv !== "production" && preview === "1";
}

export function accountGreetingName(input: {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
}): string {
  const first = input.firstName?.trim() ?? "";
  const last = input.lastName?.trim() ?? "";
  if (first) {
    const initial = last ? lastInitial(last) : null;
    return initial ? `${first} ${initial}` : first;
  }
  const parts = (input.fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "there";
  if (parts.length === 1) return parts[0];
  const initial = lastInitial(parts[parts.length - 1]);
  return initial ? `${parts[0]} ${initial}` : parts[0];
}

function lastInitial(last: string): string | null {
  const char = last.trim().charAt(0);
  if (!char) return null;
  return `${char.toLocaleUpperCase("en-US")}.`;
}

export function ordersForVerifiedEmail<T extends { customer_email?: string | null }>(
  orders: T[],
  email: string,
): T[] {
  return orders.filter((order) => emailsMatchExact(order.customer_email, email));
}

function knownStatus(value: string | null | undefined): OrderStatus | null {
  if (!value) return null;
  return (KNOWN_ORDER_STATUSES as readonly string[]).includes(value) ? (value as OrderStatus) : null;
}

export function accountProgress(
  status: string | null | undefined,
  history: AccountOrderInput["status_history"],
  options?: { scansOnly?: boolean },
): { phase: "current" | "history"; onHold: boolean; steps: AccountProgressStep[] } {
  const stored = knownStatus(status);
  const onHold = stored === ORDER_STATUS.ON_HOLD;
  const timeline = publicTimelineStatus({
    status: stored ?? ORDER_STATUS.RECEIVED_BY_YOURS,
    status_history: (history ?? [])
      .map((entry) => {
        const entryStatus = knownStatus(entry?.status);
        if (!entryStatus || !entry?.changed_at) return null;
        return { status: entryStatus, changed_at: entry.changed_at };
      })
      .filter((entry): entry is { status: OrderStatus; changed_at: string } => entry !== null),
  });
  const pipeline = stored === ORDER_STATUS.ON_HOLD ? timeline : stored;
  const dropped = pipeline === ORDER_STATUS.RECEIVED_BY_YOURS
    || pipeline === ORDER_STATUS.RECEIVED_AT_LAB
    || pipeline === ORDER_STATUS.READY_FOR_PICKUP
    || pipeline === ORDER_STATUS.SCANS_SENT;
  const lab = pipeline === ORDER_STATUS.RECEIVED_AT_LAB
    || pipeline === ORDER_STATUS.READY_FOR_PICKUP
    || pipeline === ORDER_STATUS.SCANS_SENT;
  const scans = pipeline === ORDER_STATUS.SCANS_SENT;
  if (options?.scansOnly) {
    return {
      phase: scans ? "history" : "current",
      onHold,
      steps: [
        { label: "Dropped off", reached: dropped },
        { label: "Scans sent", reached: scans },
      ],
    };
  }
  return {
    phase: scans ? "history" : "current",
    onHold,
    steps: [
      { label: "Dropped off", reached: dropped },
      { label: "At lab", reached: lab },
      { label: "Scans sent", reached: scans },
    ],
  };
}

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function accountDownloads(order: AccountOrderInput): AccountDownload[] {
  const candidates: AccountDownload[] = [];
  const full = safeHttpUrl(order.wetransfer_link);
  const color = safeHttpUrl(order.color_scans_wetransfer_link);
  const bw = safeHttpUrl(order.bw_scans_wetransfer_link);
  if (full) candidates.push({ label: "Download scans", href: full });
  if (color && color !== full) candidates.push({ label: "Download color scans", href: color });
  if (bw && bw !== full && bw !== color) candidates.push({ label: "Download black & white scans", href: bw });
  return candidates;
}

function countedPills(order: AccountOrderInput): { stock: string; format: string | null; index: number }[] {
  if (order.roll_details?.length) {
    const kept = order.roll_details
      .map((roll, index) => ({ roll, index }))
      .filter(({ roll }) => !isBlankRoll(roll));
    const anyRollStock = kept.some((entry) => Boolean(entry.roll.film_stock?.trim()));
    const orderStock = correctFilmStockSpelling(order.film_stock?.trim() ?? "");
    return kept.flatMap(({ roll, index }) => {
      const stock = correctFilmStockSpelling(roll.film_stock?.trim() || (anyRollStock ? "" : orderStock));
      if (!stock) return [];
      return [{ stock, format: roll.film_type ?? order.film_type ?? null, index }];
    });
  }

  const count = Number.isFinite(order.roll_count) ? Math.max(0, Math.floor(order.roll_count ?? 0)) : 0;
  const stock = correctFilmStockSpelling(order.film_stock?.trim() ?? "");
  if (!stock || count === 0) return [];
  return Array.from({ length: count }, (_, index) => ({
    stock,
    format: order.film_type ?? null,
    index,
  }));
}

function recencyMillis(order: AccountOrderInput): number {
  const raw = order.scans_sent_at || order.received_by_yours_at || order.created_at || order.dropoff_date;
  if (!raw) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const noon = Date.parse(`${raw}T12:00:00Z`);
    return Number.isNaN(noon) ? 0 : noon;
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function accountFavorites(orders: AccountOrderInput[]): AccountFavorite[] {
  const hits = new Map<string, { count: number; at: number; index: number; formats: Map<string, number> }>();
  for (const order of orders) {
    const at = recencyMillis(order);
    for (const roll of countedPills(order)) {
      const existing = hits.get(roll.stock);
      const formatKey = roll.format?.trim() || "";
      if (!existing) {
        const formats = new Map<string, number>();
        if (formatKey) formats.set(formatKey, 1);
        hits.set(roll.stock, { count: 1, at, index: roll.index, formats });
        continue;
      }
      existing.count += 1;
      if (formatKey) existing.formats.set(formatKey, (existing.formats.get(formatKey) ?? 0) + 1);
      if (at > existing.at || (at === existing.at && roll.index > existing.index)) {
        existing.at = at;
        existing.index = roll.index;
      }
    }
  }

  return [...hits.entries()]
    .sort((left, right) => {
      if (right[1].count !== left[1].count) return right[1].count - left[1].count;
      if (right[1].at !== left[1].at) return right[1].at - left[1].at;
      return right[1].index - left[1].index;
    })
    .slice(0, FAVORITE_LIMIT)
    .map(([stock, hit]) => ({ stock, href: favoriteHref(stock, hit.formats) }));
}

function favoriteHref(stock: string, formats: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  let tie = false;
  for (const [format, count] of formats) {
    if (count > bestCount) {
      best = format;
      bestCount = count;
      tie = false;
    } else if (count === bestCount) {
      tie = true;
    }
  }
  if (!best || tie) return null;
  return filmProductUrl(stock, best);
}

export function formatAccountDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, day)));
  }
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(parsed));
}

function asFilmOrder(order: AccountOrderInput): FilmOrder {
  const status = knownStatus(order.status) ?? ORDER_STATUS.RECEIVED_BY_YOURS;
  return {
    id: order.id,
    order_number: order.order_number,
    customer_id: "",
    customer_name: order.customer_name ?? "",
    customer_email: order.customer_email ?? "",
    status,
    status_history: [],
    status_updated_at: order.created_at ?? "",
    film_type: (order.film_type || "35mm") as FilmType,
    film_process: "Color",
    film_stock: order.film_stock ?? undefined,
    roll_count: order.roll_count ?? 0,
    roll_details: order.roll_details ?? undefined,
    dropoff_date: order.dropoff_date ?? "",
    dropoff_number: order.dropoff_number ?? 0,
    received_by_yours_at: order.received_by_yours_at ?? undefined,
    created_at: order.created_at ?? undefined,
  };
}

function toView(order: AccountOrderInput): { phase: "current" | "history"; view: AccountOrderView; at: number } {
  const progress = accountProgress(order.status, order.status_history, {
    scansOnly: isScansOnlyOrder(asFilmOrder(order)),
  });
  const note = order.scan_notes?.trim() || null;
  return {
    phase: progress.phase,
    at: recencyMillis(order),
    view: {
      id: order.id,
      orderNumber: order.order_number,
      dateLabel: formatAccountDate(order.dropoff_date || order.received_by_yours_at || order.created_at),
      onHold: progress.onHold,
      holdMessage: progress.onHold ? ACCOUNT_ON_HOLD_MESSAGE : null,
      steps: progress.steps,
      rolls: countedPills(order).map(({ stock, format }) => ({ stock, format })),
      downloads: accountDownloads(order),
      scanNotes: note,
    },
  };
}

export function buildAccountProfile(input: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  orders: AccountOrderInput[];
  now?: Date;
}): AccountProfileData {
  const orders = ordersForVerifiedEmail(input.orders, input.email);
  const latestName = [...orders].sort((left, right) => recencyMillis(right) - recencyMillis(left))[0]?.customer_name;
  const firstName = input.firstName?.trim() || null;
  const lastName = input.lastName?.trim() || null;
  const contactName = [firstName, lastName].filter(Boolean).join(" ") || latestName?.trim() || null;
  const views = orders.map(toView).sort((left, right) => right.at - left.at);

  return {
    greetingName: accountGreetingName({
      firstName,
      lastName,
      fullName: latestName,
    }),
    email: input.email.trim(),
    contactName,
    stats: computeCustomerEmailStats(orders.map(asFilmOrder), input.now),
    milesSaved: accountMilesSaved(orders),
    current: views.filter((entry) => entry.phase === "current").map((entry) => entry.view),
    history: views.filter((entry) => entry.phase === "history").map((entry) => entry.view),
    favorites: accountFavorites(orders),
    recommendations: recommendNewFilms(orders.flatMap((order) => countedPills(order).map(({ stock, format }) => ({ stock, format })))),
  };
}

/** Sample profile for local layout checks. Production never serves this. */
export function previewAccountProfile(now = new Date()): AccountProfileData {
  return buildAccountProfile({
    email: "jane@example.com",
    firstName: "Jane",
    lastName: "Doe",
    now,
    orders: [
      {
        id: "preview-history",
        order_number: "YM-1042",
        customer_name: "Jane Doe",
        customer_email: "Jane@Example.com",
        status: "Scans Sent",
        dropoff_date: "2026-04-25",
        received_by_yours_at: "2026-04-25T15:00:00.000Z",
        scans_sent_at: "2026-05-02T15:00:00.000Z",
        created_at: "2026-04-25T15:00:00.000Z",
        roll_count: 4,
        wetransfer_link: "https://wetransfer.com/downloads/example-scans",
        scan_notes: "A few frames at the start of the Gold roll came back blank.",
        roll_details: [
          { film_type: "35mm", film_process: "Color", film_stock: "Kodak Portra 400" },
          { film_type: "35mm", film_process: "Color", film_stock: "Kodak Portra 400" },
          { film_type: "35mm", film_process: "Color", film_stock: "Kodak Gold 200" },
          { film_type: "35mm", film_process: "Color", film_stock: "Kodak Gold 200", blank: true },
        ],
      },
      {
        id: "preview-lab",
        order_number: "YM-1108",
        customer_name: "Jane Doe",
        customer_email: "jane@example.com",
        status: "Received at Lab",
        dropoff_date: "2026-08-01",
        received_by_yours_at: "2026-08-01T15:00:00.000Z",
        created_at: "2026-08-01T15:00:00.000Z",
        roll_count: 2,
        color_scans_wetransfer_link: "https://wetransfer.com/downloads/example-color",
        roll_details: [
          { film_type: "120", film_process: "Color", film_stock: "Kodak Portra 400" },
          { film_type: "35mm", film_process: "Black & White", film_stock: "Ilford HP5 Plus 400" },
        ],
      },
      {
        id: "preview-hold",
        order_number: "YM-1180",
        customer_name: "Jane Doe",
        customer_email: "jane@example.com",
        status: "On Hold",
        status_history: [
          { status: "Received by Yours", changed_at: "2026-09-12T15:00:00.000Z" },
          { status: "On Hold", changed_at: "2026-09-14T15:00:00.000Z" },
        ],
        dropoff_date: "2026-09-12",
        received_by_yours_at: "2026-09-12T15:00:00.000Z",
        created_at: "2026-09-12T15:00:00.000Z",
        roll_count: 1,
        roll_details: [
          { film_type: "35mm", film_process: "Color", film_stock: "Cinestill 800T" },
        ],
      },
      {
        id: "preview-other-customer",
        order_number: "YM-9999",
        customer_name: "Bea Knitter",
        customer_email: "bea@example.com",
        status: "Scans Sent",
        dropoff_date: "2026-06-01",
        received_by_yours_at: "2026-06-01T15:00:00.000Z",
        created_at: "2026-06-01T15:00:00.000Z",
        roll_count: 1,
        film_stock: "Kodak Portra 800",
        film_type: "35mm",
      },
    ],
  });
}
