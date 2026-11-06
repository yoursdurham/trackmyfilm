import type { DisplayPayload } from "@/lib/display";
import { displayRefreshPolicy, FILM_STATS_REFRESH_MS } from "@/lib/display-schedule";
import { nextSaturdayOpening } from "@/lib/shop-hours";

/**
 * Last film-menu or film-stats payload for one server process.
 * Repeat kiosk polls are answered from here and do not read Supabase.
 * Live modes are not stored. Preview and `?refresh=1` skip this copy.
 */

interface Entry {
  payload: DisplayPayload;
  freshUntil: number;
}

const entries = new Map<string, Entry>();

export function clearDisplayPayloadCache(): void {
  entries.clear();
}

export function forgetDisplayPayload(slug: string): void {
  entries.delete(slug);
}

export function readFreshDisplayPayload(slug: string, now: number): DisplayPayload | null {
  const entry = entries.get(slug);
  if (!entry || entry.freshUntil <= now) return null;
  return entry.payload;
}

export function rememberDisplayPayload(slug: string, payload: DisplayPayload, now: Date): void {
  const policy = displayRefreshPolicy(payload.mode);
  if (policy === "poll") {
    entries.delete(slug);
    return;
  }
  const freshUntil = policy === "weekly"
    ? nextSaturdayOpening(now).getTime()
    : now.getTime() + FILM_STATS_REFRESH_MS;
  entries.set(slug, { payload, freshUntil });
}
