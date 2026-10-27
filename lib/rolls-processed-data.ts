import { unstable_cache } from "next/cache";
import { getRollsProcessedOrders } from "@/lib/db";
import { computePublicRollsProcessed, type PublicRollsProcessed } from "@/lib/film-metrics";

const REVALIDATE_SECONDS = 3600;

export async function loadPublicRollsProcessed(now = new Date()): Promise<PublicRollsProcessed> {
  const orders = await getRollsProcessedOrders(now);
  return computePublicRollsProcessed(orders, now);
}

/** One aggregate read per hour. The response cache is shorter, same as miles saved. */
export const getCachedPublicRollsProcessed = unstable_cache(
  async () => loadPublicRollsProcessed(new Date()),
  ["public-rolls-processed"],
  { revalidate: REVALIDATE_SECONDS },
);
