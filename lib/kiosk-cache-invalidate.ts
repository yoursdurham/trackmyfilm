import { revalidateTag } from "next/cache";
import { DISPLAY_ROW_CACHE_TAG, FILM_MENU_CACHE_TAG } from "@/lib/display-cache-tags";

/**
 * Drop a kiosk data-cache entry now. `{ expire: 0 }` makes the next read
 * miss instead of serving the previous copy while a refresh runs.
 * A cache runtime that cannot invalidate must not fail the save that
 * already landed in the database; the cache TTL is the backup.
 */
function expireKioskTag(tag: string): void {
  try {
    revalidateTag(tag, { expire: 0 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[kiosk-cache]", message);
  }
}

export function invalidateKioskDisplayRow(): void {
  expireKioskTag(DISPLAY_ROW_CACHE_TAG);
}

export function invalidateKioskFilmMenu(): void {
  expireKioskTag(FILM_MENU_CACHE_TAG);
}
