import { lastSaturdayOpening, nextSaturdayOpening } from "@/lib/shop-hours";

/**
 * How often a screen reads Supabase.
 *
 * The decision follows the mode the screen is showing, which is the resolved
 * payload (a booking or a custom message already beat the default). It is not
 * the default saved on the display row.
 *
 *   film_menu   once a week, Saturdays at 11:00 AM America/New_York,
 *               and again within one config check after a price save
 *   film_stats  every two hours
 *   everything else holds. A dashboard change arrives on the config check.
 *
 * The config check is every couple of minutes. The server answers it from a
 * data cache, so a routine check does not read Supabase. A save drops that
 * cache and the next check reads the row once. The Open sign follows the
 * shop clock on the TV and does not wait for a poll. last_seen is a separate
 * heartbeat, not part of this check. A later fetch that comes back as a
 * different mode adopts that mode's schedule immediately.
 */

/** How often a screen asks for its row. The answer is cached until a save. */
export const DISPLAY_CONFIG_POLL_MS = 2 * 60 * 1000;

export const FILM_STATS_REFRESH_MS = 2 * 60 * 60 * 1000;
/** Cap for a failed film-menu or film-stats fetch. The player backs off up to this. */
export const DISPLAY_REFRESH_RETRY_MS = 15 * 60 * 1000;
/** Query flag. Open `/display/<slug>?refresh=1` on the TV to fetch once immediately. */
export const DISPLAY_REFRESH_QUERY = "refresh";

const MIN_WAIT_MS = 1_000;
/** Browsers clamp setTimeout above this. A week fits; the player replans if it does not. */
const MAX_WAIT_MS = 2_147_483_647;

export type DisplayRefreshPolicy = "weekly" | "two-hour" | "poll";

/**
 * Delay after failed polls. The first failure waits `baseMs`, then each
 * further failure doubles, up to `capMs`. Zero failures is the normal cadence.
 */
export function displayPollDelayMs(failures: number, baseMs: number, capMs = DISPLAY_REFRESH_RETRY_MS): number {
  if (!Number.isFinite(baseMs) || baseMs <= 0) return capMs;
  if (!Number.isFinite(failures) || failures <= 1) return Math.min(baseMs, capMs);
  const shift = Math.min(Math.floor(failures) - 1, 8);
  const scaled = baseMs * 2 ** shift;
  if (!Number.isFinite(scaled)) return capMs;
  return Math.min(capMs, Math.max(baseMs, scaled));
}

export function displayRefreshPolicy(mode: string | null | undefined): DisplayRefreshPolicy {
  if (mode === "film_menu") return "weekly";
  if (mode === "film_stats") return "two-hour";
  return "poll";
}

export function isSlowDisplayMode(mode: string | null | undefined): boolean {
  return displayRefreshPolicy(mode) !== "poll";
}

export function displayContentFresh(input: {
  mode: string;
  fetchedAt: number;
  now: Date;
}): boolean {
  if (!Number.isFinite(input.fetchedAt)) return false;
  const policy = displayRefreshPolicy(input.mode);
  if (policy === "weekly") return input.fetchedAt >= lastSaturdayOpening(input.now).getTime();
  if (policy === "two-hour") return input.now.getTime() - input.fetchedAt < FILM_STATS_REFRESH_MS;
  return false;
}

function waitUntilNext(mode: string, fetchedAt: number, now: Date): number {
  const policy = displayRefreshPolicy(mode);
  let due = now.getTime() + MIN_WAIT_MS;
  if (policy === "weekly") due = nextSaturdayOpening(now).getTime();
  else if (policy === "two-hour") due = fetchedAt + FILM_STATS_REFRESH_MS;
  const wait = due - now.getTime();
  if (wait <= MIN_WAIT_MS) return MIN_WAIT_MS;
  return Math.min(wait, MAX_WAIT_MS);
}

export interface DisplaySyncPlan {
  /** fetch once, wait with no network, or hold until the config check says something changed. */
  action: "fetch" | "wait" | "hold";
  waitMs: number;
  pollMs: number;
  /**
   * Kept so callers can see which fetches used to check in.
   * The player posts last_seen on its own timer instead.
   */
  heartbeat: boolean;
  /** A new deploy reloads the page only when a fetch actually ran. */
  checkReload: boolean;
  /** `?refresh=1` skips the server's saved payload and reads Supabase. */
  bypassCache: boolean;
}

/**
 * What the player should do right now.
 * `pollMs` is the live interval in milliseconds (already clamped).
 * `force` is the one-shot `?refresh=1` load.
 */
export function planDisplaySync(input: {
  mode: string | null;
  fetchedAt: number | null;
  now: Date;
  force: boolean;
  preview: boolean;
  pollMs: number;
}): DisplaySyncPlan {
  const pollMs = input.pollMs;
  if (input.force) {
    return {
      action: "fetch",
      waitMs: 0,
      pollMs,
      heartbeat: !input.preview,
      checkReload: true,
      bypassCache: true,
    };
  }

  const mode = input.mode;
  if (!mode || displayRefreshPolicy(mode) === "poll") {
    if (!mode) {
      return {
        action: "fetch",
        waitMs: 0,
        pollMs,
        heartbeat: !input.preview,
        checkReload: true,
        bypassCache: false,
      };
    }
    return {
      action: "hold",
      waitMs: 0,
      pollMs,
      heartbeat: false,
      checkReload: false,
      bypassCache: false,
    };
  }

  const fetchedAt = input.fetchedAt;
  if (typeof fetchedAt === "number" && displayContentFresh({ mode, fetchedAt, now: input.now })) {
    return {
      action: "wait",
      waitMs: waitUntilNext(mode, fetchedAt, input.now),
      pollMs,
      heartbeat: false,
      checkReload: false,
      bypassCache: false,
    };
  }

  return {
    action: "fetch",
    waitMs: 0,
    pollMs,
    heartbeat: !input.preview,
    checkReload: true,
    bypassCache: true,
  };
}
