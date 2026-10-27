import { unstable_cache } from "next/cache";
import { getTurnaroundOrders } from "@/lib/db";
import { computePublicTurnaround, type PublicTurnaround } from "@/lib/film-metrics";

const REVALIDATE_SECONDS = 3600;

export async function loadPublicTurnaround(now = new Date()): Promise<PublicTurnaround> {
  const orders = await getTurnaroundOrders(now);
  return computePublicTurnaround(orders, now);
}

/** One aggregate read per hour. The response cache is shorter, same as miles saved. */
export const getCachedPublicTurnaround = unstable_cache(
  async () => loadPublicTurnaround(new Date()),
  ["public-turnaround"],
  { revalidate: REVALIDATE_SECONDS },
);
