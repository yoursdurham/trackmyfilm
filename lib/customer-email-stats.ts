import { isBlankRoll } from "./blank-roll";
import type { FilmOrder } from "./types";

const SHOP_TIME_ZONE = "America/New_York";
const DAY_MS = 24 * 60 * 60 * 1000;

export type CustomerEmailStats = {
  rolls_dropped_off: string;
  top_stock: string;
  days_since_first_drop: string;
};

export const EMPTY_CUSTOMER_EMAIL_STATS: CustomerEmailStats = {
  rolls_dropped_off: "",
  top_stock: "",
  days_since_first_drop: "",
};

type StockHit = {
  count: number;
  at: number;
  index: number;
};

function calendarKeyInShopZone(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Date-only values are already shop calendar dates. Timestamps convert to America/New_York. */
function shopCalendarKey(raw: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return null;
  return calendarKeyInShopZone(new Date(parsed));
}

function wholeDaysUntilToday(startKey: string, now: Date): number {
  const todayKey = calendarKeyInShopZone(now);
  const start = Date.parse(`${startKey}T00:00:00Z`);
  const today = Date.parse(`${todayKey}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(today)) return 0;
  return Math.max(0, Math.round((today - start) / DAY_MS));
}

function recencyMillis(order: FilmOrder): number {
  const raw = order.received_by_yours_at || order.created_at || order.dropoff_date;
  if (!raw) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const noon = Date.parse(`${raw}T12:00:00Z`);
    return Number.isNaN(noon) ? 0 : noon;
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function countedRolls(order: FilmOrder): { stock: string; index: number }[] {
  if (order.roll_details?.length) {
    const kept = order.roll_details
      .map((roll, index) => ({ roll, index }))
      .filter(({ roll }) => !isBlankRoll(roll));
    const anyRollStock = kept.some((entry) => Boolean(entry.roll.film_stock?.trim()));
    const orderStock = order.film_stock?.trim() ?? "";
    return kept.map(({ roll, index }) => ({
      stock: roll.film_stock?.trim() || (anyRollStock ? "" : orderStock),
      index,
    }));
  }

  const count = Number.isFinite(order.roll_count) ? Math.max(0, Math.floor(order.roll_count)) : 0;
  const stock = order.film_stock?.trim() ?? "";
  return Array.from({ length: count }, (_, index) => ({ stock, index }));
}

function rememberStock(hits: Map<string, StockHit>, stock: string, at: number, index: number) {
  const existing = hits.get(stock);
  if (!existing) {
    hits.set(stock, { count: 1, at, index });
    return;
  }
  existing.count += 1;
  if (at > existing.at || (at === existing.at && index > existing.index)) {
    existing.at = at;
    existing.index = index;
  }
}

function topStock(orders: FilmOrder[]): string {
  const hits = new Map<string, StockHit>();
  for (const order of orders) {
    const at = recencyMillis(order);
    for (const roll of countedRolls(order)) {
      if (!roll.stock) continue;
      rememberStock(hits, roll.stock, at, roll.index);
    }
  }

  let bestStock = "";
  let best: StockHit | null = null;
  for (const [stock, hit] of hits) {
    if (
      !best
      || hit.count > best.count
      || (hit.count === best.count && (hit.at > best.at || (hit.at === best.at && hit.index > best.index)))
    ) {
      best = hit;
      bestStock = stock;
    }
  }
  return bestStock;
}

function earliestDropKey(orders: FilmOrder[]): string | null {
  let earliest: string | null = null;
  for (const order of orders) {
    const raw = order.received_by_yours_at || order.created_at;
    if (!raw) continue;
    const key = shopCalendarKey(raw);
    if (!key) continue;
    if (!earliest || key < earliest) earliest = key;
  }
  return earliest;
}

/**
 * Per-customer figures for Resend. Blank rolls are left out of the roll total
 * and the stock tally. A first order still returns numbers, including "0" days.
 */
export function computeCustomerEmailStats(
  orders: FilmOrder[],
  now: Date = new Date(),
): CustomerEmailStats {
  if (!orders.length) return { ...EMPTY_CUSTOMER_EMAIL_STATS };

  const rolls = orders.reduce((sum, order) => sum + countedRolls(order).length, 0);
  const firstKey = earliestDropKey(orders);

  return {
    rolls_dropped_off: String(rolls),
    top_stock: topStock(orders),
    days_since_first_drop: firstKey ? String(wholeDaysUntilToday(firstKey, now)) : "",
  };
}
