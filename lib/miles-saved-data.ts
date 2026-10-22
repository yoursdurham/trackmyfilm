import { unstable_cache } from "next/cache";
import { countAllFilmOrders, countFilmOrdersCreatedInRange } from "@/lib/db";
import {
  allTimeMiles,
  labRunsElapsed,
  legacyDropoffsForYear,
  shopYearWindow,
  toPublicMiles,
  type PublicMilesSaved,
} from "@/lib/miles-saved";

const REVALIDATE_SECONDS = 3600;

/**
 * Non-production only, so a local homepage can render without a service key.
 * Ignored when NODE_ENV is production. Never set this on Vercel.
 */
function previewOrderCount(): number | null {
  if (process.env.NODE_ENV === "production") return null;
  const raw = process.env.MILES_SAVED_PREVIEW_ORDERS;
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

/** One count query, then only miles, laps, and the shop year. */
export async function loadPublicMilesSaved(now = new Date()): Promise<PublicMilesSaved> {
  const window = shopYearWindow(now);
  const preview = previewOrderCount();
  const ordersCreated = preview ?? await countFilmOrdersCreatedInRange(window.startIso, window.endIso);
  const { miles, laps } = toPublicMiles({
    legacyDropoffs: legacyDropoffsForYear(window.year),
    ordersCreated,
    labRuns: labRunsElapsed(now, window.start),
  });
  return { miles, laps, year: window.year };
}

/**
 * Shared data cache. The tracking page can be requested often; the count
 * query runs at most about once an hour.
 */
export const getCachedPublicMilesSaved = unstable_cache(
  async () => loadPublicMilesSaved(new Date()),
  ["public-miles-saved"],
  { revalidate: REVALIDATE_SECONDS },
);

/** Miles and laps only. The order count stays on the server. */
export async function loadAllTimeMilesSaved(now = new Date()): Promise<{ miles: number; laps: number }> {
  const preview = previewOrderCount();
  const ordersCreated = preview ?? await countAllFilmOrders();
  return allTimeMiles({ ordersCreated, now });
}

/**
 * Shared with the studio stats payload. The display poll does not recount;
 * this count runs at most about once an hour, same as the homepage globe.
 */
export const getCachedAllTimeMilesSaved = unstable_cache(
  async () => loadAllTimeMilesSaved(new Date()),
  ["all-time-miles-saved"],
  { revalidate: REVALIDATE_SECONDS },
);
