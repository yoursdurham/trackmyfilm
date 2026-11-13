import { unstable_cache } from "next/cache";
import { getDisplayBySlug, getFilmMenuUpdatedAt } from "@/lib/db";
import type { DisplayRow } from "@/lib/display";
import { DISPLAY_ROW_CACHE_TAG, FILM_MENU_CACHE_TAG } from "@/lib/display-cache-tags";

/**
 * How long a kiosk may reuse a display row or the film-menu timestamp
 * without asking Supabase. A dashboard save invalidates the tag sooner.
 * This is a safety net for an edit that did not clear the tag.
 */
export const KIOSK_DATA_CACHE_SECONDS = 24 * 60 * 60;

export const getCachedDisplayBySlug = unstable_cache(
  async (slug: string): Promise<DisplayRow | null> => getDisplayBySlug(slug),
  ["kiosk-display-row"],
  { revalidate: KIOSK_DATA_CACHE_SECONDS, tags: [DISPLAY_ROW_CACHE_TAG] },
);

export const getCachedFilmMenuRevision = unstable_cache(
  async (): Promise<string> => getFilmMenuUpdatedAt(),
  ["kiosk-film-menu-revision"],
  { revalidate: KIOSK_DATA_CACHE_SECONDS, tags: [FILM_MENU_CACHE_TAG] },
);

/** Cached row for routine polls. `fresh` reads Supabase, for `?refresh=1` and staff preview. */
export async function readKioskDisplay(slug: string, fresh = false): Promise<DisplayRow | null> {
  if (fresh) return getDisplayBySlug(slug);
  return getCachedDisplayBySlug(slug);
}
