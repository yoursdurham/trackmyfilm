/**
 * Display engine for physical screens.
 *
 * The resolver is pure: it picks one state from the display row plus optional
 * studio, film, playlist, and film-menu inputs. Callers compute those and
 * pass them in; this module never reads the database.
 *
 * Priority (spec section 7.1):
 *   100  manual override (custom message today)
 *    80  active studio session, including the ending-soon window
 *    70  studio welcome window
 *    50  upcoming session
 *    10  playlist, or the screen's default mode when no playlist is playing
 *
 * Studio time windows are classified by the caller with `now` before this
 * function runs, so the clock and the calendar stay outside the renderer.
 */

import { sanitizeFilmDepartures } from "@/lib/film-departures";
import { sanitizeFilmMenu } from "@/lib/film-menu";
import {
  sanitizeStudioLines,
  studioCheckoutLinesFromRow,
  studioInfoLinesFromRow,
} from "@/lib/studio-info";

export const DISPLAY_THEME = "yours-clean";
export const DEFAULT_REFRESH_SECONDS = 30;
export const MIN_REFRESH_SECONDS = 10;
export const MAX_REFRESH_SECONDS = 300;
/** A screen is online if it checked in within this window (a 5-minute heartbeat plus a minute of grace). */
export const DISPLAY_ONLINE_WINDOW_MS = 6 * 60 * 1000;
export const CUSTOM_MESSAGE_MAX_LENGTH = 280;
export const DISPLAY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Physical panels with a dead strip. Keyed by slug so a screen can avoid
 * that edge without a database column. `studio-vertical` is the Acer
 * 1080×3840 mounted portrait: the dead strip runs past the old 210px
 * inset, so the live area starts 240px in and the board uses the rest
 * of the width.
 */
export const DISPLAY_SAFE_AREA = {
  "studio-vertical": { left: 240 },
} as const;

export function displaySafeArea(slug: string): { left: number } {
  if (Object.prototype.hasOwnProperty.call(DISPLAY_SAFE_AREA, slug)) {
    return DISPLAY_SAFE_AREA[slug as keyof typeof DISPLAY_SAFE_AREA];
  }
  return { left: 0 };
}

export const DISPLAY_PRIORITY = {
  override: 100,
  studioActive: 80,
  studioWelcome: 70,
  studioUpcoming: 50,
  playlistOrDefault: 10,
} as const;

export const STUDIO_DATA_KEYS = ["firstName", "sessionType", "start", "end"] as const;
export const STUDIO_INFO_KEY = "infoLines";
export const STUDIO_CHECKOUT_KEY = "checkoutLines";
export const FILM_STATS_DATA_KEYS = [
  "rollsProcessing",
  "receivedToday",
  "receivedThisWeek",
  "scansSentToday",
  "scansSentThisWeek",
  "averageColorTurnaroundDays",
  "averageBwTurnaroundDays",
  "nextLabRun",
] as const;
export const FILM_STATUS_DATA_KEYS = [
  "averageColorTurnaroundDays",
  "averageBwTurnaroundDays",
  "nextLabRun",
] as const;
export const FILM_MENU_DATA_KEYS = ["menu"] as const;
export const FILM_DEPARTURES_DATA_KEYS = ["departures"] as const;
export const CRT_GREEN_THEME = "crt-green";
export const AIRPORT_THEME = "airport";

export const SELECTABLE_DEFAULT_MODES = [
  { value: "idle", label: "Branded idle" },
  { value: "film_stats", label: "Film stats" },
  { value: "film_menu", label: "Film menu" },
  { value: "film_departures", label: "Airport board" },
] as const;

export type DisplayOrientation = "portrait" | "landscape";

export interface DisplayRow {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  orientation: DisplayOrientation;
  resolution: string | null;
  mode: string;
  playlist_id: string | null;
  theme: string | null;
  is_enabled: boolean;
  last_seen: string | null;
  last_client: Record<string, unknown> | null;
  override_mode: string | null;
  override_payload: unknown;
  show_studio_bookings?: boolean | null;
  /** Ordered guest notes. Null means the column is missing and the seed copy is used. */
  studio_info_lines?: unknown;
  studio_checkout_lines?: unknown;
  created_at?: string;
  updated_at?: string;
}

/** Safe studio fields. Callers may pass a wider booking object; extra keys are dropped. */
export interface StudioSessionView {
  firstName?: string | null;
  sessionType?: string | null;
  start?: string | null;
  end?: string | null;
  [key: string]: unknown;
}

export interface StudioDisplayInput {
  active?: StudioSessionView | null;
  /** Last minutes of the active session. Wins over `active` when both are set. */
  endingSoon?: StudioSessionView | null;
  welcome?: StudioSessionView | null;
  upcoming?: StudioSessionView | null;
}

export interface FilmMetricsInput {
  rollsProcessing?: number | null;
  receivedToday?: number | null;
  receivedThisWeek?: number | null;
  scansSentToday?: number | null;
  scansSentThisWeek?: number | null;
  averageColorTurnaroundDays?: number | null;
  averageBwTurnaroundDays?: number | null;
  nextLabRun?: string | null;
  [key: string]: unknown;
}

export interface PlaylistItemInput {
  mode: string;
  durationSeconds?: number;
  enabled?: boolean;
  data?: Record<string, unknown> | null;
}

export interface PlaylistInput {
  items: PlaylistItemInput[];
  /** Index into the enabled items, chosen by the caller from the clock. */
  activeIndex?: number;
}

export interface DisplayResolveInput {
  display: Pick<DisplayRow, "mode" | "theme" | "is_enabled" | "override_mode" | "override_payload"> & {
    refresh_seconds?: number | null;
    show_studio_bookings?: boolean | null;
    studio_info_lines?: unknown;
    studio_checkout_lines?: unknown;
  };
  now?: Date;
  studio?: StudioDisplayInput | null;
  film?: FilmMetricsInput | null;
  /** Sanitized again before it can reach a public payload. */
  menu?: unknown;
  /** Sanitized again before it can reach a public payload. */
  departures?: unknown;
  playlist?: PlaylistInput | null;
}

export interface DisplayPayload {
  mode: string;
  theme: string;
  refreshSeconds: number;
  /** Deployment that produced this payload. The player reloads when it changes. */
  buildId: string;
  data: Record<string, unknown>;
}

export interface ResolvedDisplay extends DisplayPayload {
  priority: number;
}

export interface HeartbeatClient {
  appVersion: string | null;
  userAgent: string | null;
}

/** Idle, a custom message, studio booking states, and the film menu use the CRT screen. Film stats stay yours-clean. The airport board has its own theme. */
const CRT_DEFAULT_MODES = new Set([
  "idle",
  "custom_message",
  "studio_active",
  "studio_welcome",
  "studio_upcoming",
  "studio_ending_soon",
  "film_menu",
]);

export function displayUsesCrtTheme(mode: string): boolean {
  return CRT_DEFAULT_MODES.has(mode);
}

export function displayUsesAirportTheme(mode: string): boolean {
  return mode === "film_departures";
}

export function isKnownDisplayMode(mode: string): boolean {
  return Object.prototype.hasOwnProperty.call(DATA_KEYS_BY_MODE, mode);
}

const DATA_KEYS_BY_MODE: Record<string, readonly string[]> = {
  idle: [],
  custom_message: ["message"],
  studio_active: [...STUDIO_DATA_KEYS, STUDIO_INFO_KEY],
  studio_welcome: [...STUDIO_DATA_KEYS, STUDIO_INFO_KEY],
  studio_upcoming: STUDIO_DATA_KEYS,
  studio_ending_soon: [...STUDIO_DATA_KEYS, STUDIO_CHECKOUT_KEY],
  film_stats: FILM_STATS_DATA_KEYS,
  film_status: FILM_STATUS_DATA_KEYS,
  film_menu: FILM_MENU_DATA_KEYS,
  film_departures: FILM_DEPARTURES_DATA_KEYS,
};

export function isDisplaySlug(slug: string): boolean {
  return slug.length <= 64 && DISPLAY_SLUG_PATTERN.test(slug);
}

export function isSelectableDefaultMode(mode: string): boolean {
  return SELECTABLE_DEFAULT_MODES.some((option) => option.value === mode);
}

/** Plain text only. Tags are removed, not decoded into HTML. */
export function sanitizeCustomMessage(input: unknown): string {
  if (typeof input !== "string") return "";
  const withoutTags = input.replace(/<[^>]*>/g, "");
  const withoutControls = withoutTags.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return withoutControls
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, CUSTOM_MESSAGE_MAX_LENGTH);
}

function plainText(input: unknown, max: number): string | null {
  const clean = sanitizeCustomMessage(input).replace(/\n/g, " ").trim();
  if (!clean) return null;
  return clean.slice(0, max);
}

function messageFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  return sanitizeCustomMessage((payload as { message?: unknown }).message);
}

function pickStudio(source: StudioSessionView | null | undefined): Record<string, string> {
  if (!source) return {};
  const data: Record<string, string> = {};
  for (const key of STUDIO_DATA_KEYS) {
    const value = plainText(source[key], 80);
    if (value) data[key] = value;
  }
  return data;
}

function withStudioLines(
  data: Record<string, string>,
  key: typeof STUDIO_INFO_KEY | typeof STUDIO_CHECKOUT_KEY,
  lines: string[],
): Record<string, unknown> {
  return lines.length ? { ...data, [key]: lines } : data;
}

const NULLABLE_FILM_KEYS = new Set([
  "averageColorTurnaroundDays",
  "averageBwTurnaroundDays",
]);

const NUMERIC_FILM_KEYS = new Set<string>([
  ...FILM_STATS_DATA_KEYS.filter((key) => key !== "nextLabRun"),
  ...FILM_STATUS_DATA_KEYS.filter((key) => key !== "nextLabRun"),
]);

function pickFilm(film: FilmMetricsInput | null | undefined, keys: readonly string[]): Record<string, unknown> {
  if (!film) return {};
  const data: Record<string, unknown> = {};
  for (const key of keys) {
    const value = film[key];
    if (key === "nextLabRun") {
      const text = plainText(value, 80);
      if (text) data[key] = text;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      data[key] = value;
    } else if (value === null && NULLABLE_FILM_KEYS.has(key)) {
      data[key] = null;
    }
  }
  return data;
}

export function clampRefreshSeconds(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_REFRESH_SECONDS;
  return Math.min(MAX_REFRESH_SECONDS, Math.max(MIN_REFRESH_SECONDS, Math.round(value)));
}

function themeOf(theme: string | null | undefined): string {
  const trimmed = theme?.trim();
  return trimmed || DISPLAY_THEME;
}

function themeForMode(mode: string, stored: string | null | undefined): string {
  if (displayUsesAirportTheme(mode)) return AIRPORT_THEME;
  if (displayUsesCrtTheme(mode)) return CRT_GREEN_THEME;
  return themeOf(stored);
}

export const DISPLAY_DEV_BUILD_ID = "dev";
/** One automatic refresh every few minutes, so a stuck bundle cannot reload in a loop. */
export const DISPLAY_RELOAD_COOLDOWN_MS = 3 * 60 * 1000;
export const DISPLAY_RELOAD_STORAGE_KEY = "tmf-display-reload-at";

function cleanBuildId(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/[^\w.-]/g, "").slice(0, 80);
}

/** Vercel commit or deployment id, or a stable dev constant when neither is set. */
export function displayBuildId(env?: {
  VERCEL_GIT_COMMIT_SHA?: string;
  VERCEL_DEPLOYMENT_ID?: string;
}): string {
  const source = env ?? {
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
    VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
  };
  return cleanBuildId(source.VERCEL_GIT_COMMIT_SHA)
    || cleanBuildId(source.VERCEL_DEPLOYMENT_ID)
    || DISPLAY_DEV_BUILD_ID;
}

export function payloadBuildId(value: unknown): string {
  return cleanBuildId(typeof value === "string" ? value : "") || displayBuildId();
}

/**
 * Reload when the server was deployed since this page loaded, or when the
 * payload mode is newer than this bundle. A recent reload blocks another.
 */
export function displayNeedsReload(input: {
  loadedBuildId: string;
  payloadBuildId?: string | null;
  mode: string;
  now: number;
  lastReloadAt?: number | null;
}): boolean {
  const incoming = cleanBuildId(input.payloadBuildId ?? "");
  const buildChanged = incoming.length > 0 && incoming !== input.loadedBuildId;
  const unknownMode = !isKnownDisplayMode(input.mode);
  if (!buildChanged && !unknownMode) return false;
  const last = input.lastReloadAt;
  if (typeof last === "number" && Number.isFinite(last) && input.now - last < DISPLAY_RELOAD_COOLDOWN_MS) {
    return false;
  }
  return true;
}

function dataForMode(
  mode: string,
  input: DisplayResolveInput,
  itemData?: Record<string, unknown> | null,
): Record<string, unknown> {
  if (mode === "custom_message") {
    const message = sanitizeCustomMessage(itemData?.message);
    return message ? { message } : {};
  }
  if (mode === "studio_ending_soon") {
    return withStudioLines(
      pickStudio(input.studio?.endingSoon),
      STUDIO_CHECKOUT_KEY,
      studioCheckoutLinesFromRow(input.display.studio_checkout_lines),
    );
  }
  if (mode === "studio_active") {
    return withStudioLines(
      pickStudio(input.studio?.active),
      STUDIO_INFO_KEY,
      studioInfoLinesFromRow(input.display.studio_info_lines),
    );
  }
  if (mode === "studio_welcome") {
    return withStudioLines(
      pickStudio(input.studio?.welcome),
      STUDIO_INFO_KEY,
      studioInfoLinesFromRow(input.display.studio_info_lines),
    );
  }
  if (mode === "studio_upcoming") return pickStudio(input.studio?.upcoming);
  if (mode === "film_stats") return pickFilm(input.film, FILM_STATS_DATA_KEYS);
  if (mode === "film_status") return pickFilm(input.film, FILM_STATUS_DATA_KEYS);
  if (mode === "film_menu") {
    const menu = sanitizeFilmMenu(input.menu);
    return menu ? { menu } : {};
  }
  if (mode === "film_departures") {
    const departures = sanitizeFilmDepartures(input.departures);
    return departures ? { departures } : {};
  }
  return {};
}

function activePlaylistItem(playlist: PlaylistInput | null | undefined): PlaylistItemInput | null {
  if (!playlist?.items?.length) return null;
  const enabled = playlist.items.filter((item) => item.enabled !== false && item.mode?.trim());
  if (!enabled.length) return null;
  const index = playlist.activeIndex ?? 0;
  const safeIndex = ((Math.trunc(index) % enabled.length) + enabled.length) % enabled.length;
  return enabled[safeIndex] ?? null;
}

export function resolveDisplayState(input: DisplayResolveInput): ResolvedDisplay {
  const seconds = clampRefreshSeconds(input.display.refresh_seconds);
  // Reserved for the studio-window classifier. Phase 1 callers pass the row only.
  void input.now;

  if (input.display.is_enabled === false) {
    return {
      mode: "idle",
      theme: CRT_GREEN_THEME,
      refreshSeconds: seconds,
      buildId: displayBuildId(),
      data: {},
      priority: DISPLAY_PRIORITY.playlistOrDefault,
    };
  }

  const candidates: { mode: string; priority: number; data: Record<string, unknown> }[] = [];

  const overrideMode = input.display.override_mode?.trim() || "";
  if (overrideMode) {
    const overrideData = overrideMode === "custom_message"
      ? dataForMode(overrideMode, input, { message: messageFromPayload(input.display.override_payload) })
      : dataForMode(overrideMode, input);
    const usable = overrideMode !== "custom_message" || typeof overrideData.message === "string";
    if (usable) {
      candidates.push({ mode: overrideMode, priority: DISPLAY_PRIORITY.override, data: overrideData });
    }
  }

  if (input.studio?.endingSoon) {
    candidates.push({
      mode: "studio_ending_soon",
      priority: DISPLAY_PRIORITY.studioActive,
      data: dataForMode("studio_ending_soon", input),
    });
  } else if (input.studio?.active) {
    candidates.push({
      mode: "studio_active",
      priority: DISPLAY_PRIORITY.studioActive,
      data: dataForMode("studio_active", input),
    });
  }

  if (input.studio?.welcome) {
    candidates.push({
      mode: "studio_welcome",
      priority: DISPLAY_PRIORITY.studioWelcome,
      data: dataForMode("studio_welcome", input),
    });
  }

  if (input.studio?.upcoming) {
    candidates.push({
      mode: "studio_upcoming",
      priority: DISPLAY_PRIORITY.studioUpcoming,
      data: dataForMode("studio_upcoming", input),
    });
  }

  const playlistItem = activePlaylistItem(input.playlist);
  if (playlistItem) {
    candidates.push({
      mode: playlistItem.mode,
      priority: DISPLAY_PRIORITY.playlistOrDefault,
      data: dataForMode(playlistItem.mode, input, playlistItem.data ?? null),
    });
  } else {
    const defaultMode = input.display.mode?.trim() || "idle";
    const data = dataForMode(defaultMode, input);
    const mode = defaultMode === "custom_message" && typeof data.message !== "string" ? "idle" : defaultMode;
    candidates.push({
      mode,
      priority: DISPLAY_PRIORITY.playlistOrDefault,
      data: mode === "idle" && defaultMode === "custom_message" ? {} : data,
    });
  }

  candidates.sort((a, b) => b.priority - a.priority);
  const winner = candidates[0];

  return {
    mode: winner.mode,
    theme: themeForMode(winner.mode, input.display.theme),
    refreshSeconds: seconds,
    buildId: displayBuildId(),
    data: winner.data,
    priority: winner.priority,
  };
}

/** The only object a public display response is allowed to contain. */
export function toPublicDisplayPayload(resolved: {
  mode?: unknown;
  theme?: unknown;
  refreshSeconds?: unknown;
  buildId?: unknown;
  data?: unknown;
}): DisplayPayload {
  const mode = typeof resolved.mode === "string" && resolved.mode.trim() ? resolved.mode.trim() : "idle";
  const allowed = DATA_KEYS_BY_MODE[mode] ?? [];
  const source = resolved.data && typeof resolved.data === "object"
    ? resolved.data as Record<string, unknown>
    : {};
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in source)) continue;
    const value = source[key];
    if (key === "nextLabRun") {
      const text = plainText(value, 80);
      if (text) data[key] = text;
    } else if (key === STUDIO_INFO_KEY || key === STUDIO_CHECKOUT_KEY) {
      const lines = sanitizeStudioLines(value);
      if (lines.length) data[key] = lines;
    } else if ((STUDIO_DATA_KEYS as readonly string[]).includes(key)) {
      const text = plainText(value, 80);
      if (text) data[key] = text;
    } else if (key === "menu") {
      const menu = sanitizeFilmMenu(value);
      if (menu) data.menu = menu;
    } else if (key === "departures") {
      const departures = sanitizeFilmDepartures(value);
      if (departures) data.departures = departures;
    } else if (NUMERIC_FILM_KEYS.has(key)) {
      if (typeof value === "number" && Number.isFinite(value)) data[key] = value;
      else if (value === null && NULLABLE_FILM_KEYS.has(key)) data[key] = null;
    } else {
      data[key] = value;
    }
  }
  if (mode === "custom_message") {
    const message = sanitizeCustomMessage(data.message);
    if (message) data.message = message;
    else delete data.message;
  }
  return {
    mode,
    theme: themeForMode(mode, typeof resolved.theme === "string" ? resolved.theme : null),
    refreshSeconds: clampRefreshSeconds(
      typeof resolved.refreshSeconds === "number" ? resolved.refreshSeconds : null,
    ),
    buildId: payloadBuildId(resolved.buildId),
    data,
  };
}

export function publicPayloadForDisplay(
  row: DisplayResolveInput["display"],
  extras?: Omit<DisplayResolveInput, "display">,
): DisplayPayload {
  return toPublicDisplayPayload(resolveDisplayState({ display: row, ...extras }));
}

export function isDisplayOnline(lastSeen: string | null | undefined, now = Date.now()): boolean {
  if (!lastSeen) return false;
  const time = new Date(lastSeen).getTime();
  if (Number.isNaN(time)) return false;
  const age = now - time;
  return age <= DISPLAY_ONLINE_WINDOW_MS && age >= -60_000;
}

export function parseHeartbeatClient(body: unknown, userAgent: string | null): HeartbeatClient {
  let appVersion: string | null = null;
  if (body && typeof body === "object" && "appVersion" in body) {
    const value = (body as { appVersion?: unknown }).appVersion;
    if (typeof value === "string") {
      const clean = value.replace(/[^\w.\-]/g, "").slice(0, 40);
      appVersion = clean || null;
    }
  }
  const agent = userAgent?.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 180) || null;
  return { appVersion, userAgent: agent };
}

export function isDisplayPayload(value: unknown): value is DisplayPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if ("buildId" in record && typeof record.buildId !== "string") return false;
  return typeof record.mode === "string"
    && typeof record.theme === "string"
    && typeof record.refreshSeconds === "number"
    && !!record.data
    && typeof record.data === "object";
}
