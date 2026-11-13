import type { DisplayPayload } from "@/lib/display";
import { displayRefreshPolicy, FILM_STATS_REFRESH_MS } from "@/lib/display-schedule";
import { nextSaturdayOpening } from "@/lib/shop-hours";

/**
 * Last film-menu or film-stats payload for one server process.
 * A repeat poll can reuse it only when the display row still matches, so a
 * mode or Open-sign change is not stuck behind the weekly or two-hour copy.
 * Live modes are not stored. Preview and `?refresh=1` skip this copy.
 * The heavy film queries are what this skips. The display row has its own
 * data cache, so a repeat read of the row is not a Supabase query either.
 */

interface Entry {
  payload: DisplayPayload;
  freshUntil: number;
  fingerprint: string;
}

const entries = new Map<string, Entry>();

export function clearDisplayPayloadCache(): void {
  entries.clear();
}

export function forgetDisplayPayload(slug: string): void {
  entries.delete(slug);
}

export function readFreshDisplayPayload(
  slug: string,
  now: number,
  fingerprint?: string,
): DisplayPayload | null {
  const entry = entries.get(slug);
  if (!entry || entry.freshUntil <= now) return null;
  if (fingerprint !== undefined && entry.fingerprint !== fingerprint) return null;
  return entry.payload;
}

export function rememberDisplayPayload(
  slug: string,
  payload: DisplayPayload,
  now: Date,
  fingerprint = "",
): void {
  const policy = displayRefreshPolicy(payload.mode);
  if (policy === "poll") {
    entries.delete(slug);
    return;
  }
  const freshUntil = policy === "weekly"
    ? nextSaturdayOpening(now).getTime()
    : now.getTime() + FILM_STATS_REFRESH_MS;
  entries.set(slug, { payload, freshUntil, fingerprint });
}
