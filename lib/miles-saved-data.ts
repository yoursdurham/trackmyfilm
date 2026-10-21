import { unstable_cache } from "next/cache";
import { countFilmOrdersCreatedInRange } from "@/lib/db";
import {
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
