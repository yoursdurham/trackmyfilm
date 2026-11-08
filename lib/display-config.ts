import {
  clampRefreshSeconds,
  publicPayloadForDisplay,
  sanitizeCustomMessage,
  sanitizeOpenSignStats,
  storedDisplayTheme,
  toPublicDisplayPayload,
  type DisplayPayload,
  type DisplayResolveInput,
  type FilmMetricsInput,
  type OpenSignStats,
} from "@/lib/display";
import { displayContentFresh } from "@/lib/display-schedule";
import {
  FRONT_WINDOW_SLUG,
  isOpenSignMode,
  openSignForceUntil,
  resolveOpenSignMode,
  type OpenSignMode,
} from "@/lib/shop-hours";
import { studioCheckoutLinesFromRow, studioInfoLinesFromRow } from "@/lib/studio-info";

/**
 * The display row, and nothing else. A kiosk reads this about once a minute.
 * Film stats, the film menu, departures, and the studio calendar stay on
 * their own schedule.
 */
export interface DisplayConfig {
  mode: string;
  theme: string;
  isEnabled: boolean;
  overrideMode: string | null;
  overrideMessage: string | null;
  showStudioBookings: boolean;
  /** Stored value. The player turns a past `on` back into auto on its own clock. */
  openSignMode: OpenSignMode;
  openSignUntil: string | null;
  showOpenSign: boolean;
  studioInfoLines: string[];
  studioCheckoutLines: string[];
  refreshSeconds: number;
  buildId: string;
}

export interface ModeCacheEntry {
  fetchedAt: number;
  data: Record<string, unknown>;
}

export interface OpenSignStatsCache {
  fetchedAt: number;
  stats: OpenSignStats;
}

export interface ReconcileDisplayInput {
  slug: string;
  config: DisplayConfig;
  now: Date;
  /** What the screen is showing. Null before the first payload. */
  current: { payload: DisplayPayload; fetchedAt: number } | null;
  /** Last config the screen accepted. Null on the first poll or an old cache. */
  previousConfig: DisplayConfig | null;
  modes: Partial<Record<string, ModeCacheEntry>>;
  openSignStats: OpenSignStatsCache | null;
}

export interface ReconcileDisplayResult {
  /** Show this now. Null keeps whatever is already on screen. */
  payload: DisplayPayload | null;
  fetchedAt: number | null;
  /** The mode's heavy data is missing or stale, or the Open sign needs newer stats. */
  fetchContent: boolean;
  bypassCache: boolean;
  /** The shown mode changed, so the content timer has to be armed again. */
  reschedule: boolean;
}

const SLOW_MODES = new Set(["film_menu", "film_stats"]);
const STUDIO_MODES = new Set([
  "studio_active",
  "studio_welcome",
  "studio_upcoming",
  "studio_ending_soon",
]);

function untilIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

function linesOf(value: unknown): string[] {
  return Array.isArray(value) && value.every((line) => typeof line === "string") ? value : [];
}

/** Public config for one row. Other screens cannot grow an Open sign from a stray column. */
export function toDisplayConfig(
  row: DisplayResolveInput["display"],
  buildId: string,
): DisplayConfig {
  const front = row.slug === FRONT_WINDOW_SLUG;
  const storedMode = isOpenSignMode(row.open_sign_mode)
    ? row.open_sign_mode
    : row.show_open_sign === true
      ? "auto"
      : "off";
  const overrideMode = row.override_mode?.trim() || null;
  const overrideMessage = overrideMode === "custom_message"
    ? sanitizeCustomMessage(
      row.override_payload && typeof row.override_payload === "object"
        ? (row.override_payload as { message?: unknown }).message
        : null,
    ) || null
    : null;
  return {
    mode: row.mode?.trim() || "idle",
    theme: storedDisplayTheme(row.theme),
    isEnabled: row.is_enabled !== false,
    overrideMode: overrideMode === "custom_message" && !overrideMessage ? null : overrideMode,
    overrideMessage,
    showStudioBookings: row.show_studio_bookings !== false,
    openSignMode: front ? storedMode : "off",
    openSignUntil: front ? untilIso(row.open_sign_until) : null,
    showOpenSign: front && (storedMode !== "off"),
    studioInfoLines: studioInfoLinesFromRow(row.studio_info_lines),
    studioCheckoutLines: studioCheckoutLinesFromRow(row.studio_checkout_lines),
    refreshSeconds: clampRefreshSeconds(row.refresh_seconds),
    buildId,
  };
}

export function isDisplayConfig(value: unknown): value is DisplayConfig {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.mode === "string"
    && record.mode.trim().length > 0
    && typeof record.theme === "string"
    && typeof record.isEnabled === "boolean"
    && (record.overrideMode === null || typeof record.overrideMode === "string")
    && (record.overrideMessage === null || typeof record.overrideMessage === "string")
    && typeof record.showStudioBookings === "boolean"
    && isOpenSignMode(record.openSignMode)
    && (record.openSignUntil === null || typeof record.openSignUntil === "string")
    && typeof record.showOpenSign === "boolean"
    && Array.isArray(record.studioInfoLines)
    && record.studioInfoLines.every((line) => typeof line === "string")
    && Array.isArray(record.studioCheckoutLines)
    && record.studioCheckoutLines.every((line) => typeof line === "string")
    && typeof record.refreshSeconds === "number"
    && typeof record.buildId === "string";
}

/** Fields that decide which screen is showing. Theme and the Open sign are not in here. */
export function displayConfigContentKey(config: DisplayConfig): string {
  return JSON.stringify({
    mode: config.mode,
    isEnabled: config.isEnabled,
    overrideMode: config.overrideMode,
    overrideMessage: config.overrideMessage,
    showStudioBookings: config.showStudioBookings,
    studioInfoLines: config.studioInfoLines,
    studioCheckoutLines: config.studioCheckoutLines,
  });
}

/** Theme and Open sign. A change here can be painted without a film or menu query. */
export function displayConfigChromeKey(config: DisplayConfig): string {
  return JSON.stringify({
    theme: config.theme,
    openSignMode: config.openSignMode,
    openSignUntil: config.openSignUntil,
    showOpenSign: config.showOpenSign,
  });
}

/** Identity of a cached heavy payload. A mismatch means the saved copy is for an old row. */
export function displayConfigFingerprint(config: DisplayConfig): string {
  return JSON.stringify({
    content: displayConfigContentKey(config),
    chrome: displayConfigChromeKey(config),
    refreshSeconds: config.refreshSeconds,
  });
}

function rowFromConfig(slug: string, config: DisplayConfig): DisplayResolveInput["display"] {
  return {
    slug,
    mode: config.mode,
    theme: config.theme,
    is_enabled: config.isEnabled,
    override_mode: config.overrideMode,
    override_payload: config.overrideMessage ? { message: config.overrideMessage } : null,
    show_open_sign: config.showOpenSign,
    open_sign_mode: config.openSignMode,
    open_sign_until: config.openSignUntil,
    show_studio_bookings: config.showStudioBookings,
    studio_info_lines: config.studioInfoLines,
    studio_checkout_lines: config.studioCheckoutLines,
    refresh_seconds: config.refreshSeconds,
  };
}

/**
 * Override wins. With no override, studio bookings can cover the default and
 * the row alone cannot name the winner. Null means "ask the payload route".
 */
function commandedMode(config: DisplayConfig): string | null {
  if (!config.isEnabled) return "idle";
  const override = config.overrideMode?.trim() || "";
  if (override === "custom_message") return config.overrideMessage ? "custom_message" : "idle";
  if (override) return override;
  if (config.showStudioBookings) return null;
  const mode = config.mode.trim() || "idle";
  return mode === "custom_message" ? "idle" : mode;
}

function modeEntry(
  input: ReconcileDisplayInput,
  mode: string,
): ModeCacheEntry | null {
  const saved = input.modes[mode];
  if (saved) return saved;
  if (input.current?.payload.mode === mode) {
    return { fetchedAt: input.current.fetchedAt, data: input.current.payload.data };
  }
  return null;
}

function newestStats(input: ReconcileDisplayInput): OpenSignStatsCache | null {
  const candidates: OpenSignStatsCache[] = [];
  if (input.openSignStats) candidates.push(input.openSignStats);
  const statsMode = modeEntry(input, "film_stats");
  if (statsMode) {
    candidates.push({
      fetchedAt: statsMode.fetchedAt,
      stats: sanitizeOpenSignStats(statsMode.data),
    });
  }
  if (input.current?.payload.openSignStats) {
    candidates.push({
      fetchedAt: input.current.fetchedAt,
      stats: input.current.payload.openSignStats,
    });
  }
  candidates.sort((a, b) => b.fetchedAt - a.fetchedAt);
  return candidates[0] ?? null;
}

function filmForBuild(input: ReconcileDisplayInput): FilmMetricsInput | null {
  const statsMode = modeEntry(input, "film_stats");
  if (statsMode) return statsMode.data;
  const stats = newestStats(input);
  if (!stats) return null;
  const film: FilmMetricsInput = { ...stats.stats };
  return film;
}

function buildResolved(input: ReconcileDisplayInput): DisplayPayload {
  const menu = modeEntry(input, "film_menu")?.data.menu;
  const film = filmForBuild(input);
  return publicPayloadForDisplay(rowFromConfig(input.slug, input.config), {
    now: input.now,
    ...(film ? { film } : {}),
    ...(menu ? { menu } : {}),
  });
}

function withChrome(payload: DisplayPayload, config: DisplayConfig, slug: string, now: Date): DisplayPayload {
  const openSign = resolveOpenSignMode({
    slug,
    openSignMode: config.openSignMode,
    openSignUntil: config.openSignUntil,
    legacyEnabled: config.showOpenSign,
    now,
  });
  const signCanShow = slug === FRONT_WINDOW_SLUG && (openSign === "auto" || openSign === "on");
  return toPublicDisplayPayload({
    mode: payload.mode,
    theme: config.theme,
    refreshSeconds: payload.refreshSeconds,
    buildId: payload.buildId,
    data: payload.data,
    ...(slug === FRONT_WINDOW_SLUG
      ? {
        openSign,
        openSignUntil: openSign === "on" ? openSignForceUntil(config.openSignUntil, now).toISOString() : undefined,
        showOpenSign: signCanShow,
        openSignStats: signCanShow ? (payload.openSignStats ?? sanitizeOpenSignStats(null)) : undefined,
      }
      : {}),
  });
}

function chromeMatches(current: DisplayPayload, patched: DisplayPayload): boolean {
  return current.theme === patched.theme
    && current.openSign === patched.openSign
    && current.openSignUntil === patched.openSignUntil
    && Boolean(current.showOpenSign) === Boolean(patched.showOpenSign);
}

function payloadMatchesConfig(payload: DisplayPayload, config: DisplayConfig, slug: string, now: Date): boolean {
  if (!config.isEnabled) return payload.mode === "idle";
  const override = config.overrideMode?.trim() || "";
  if (override === "custom_message") {
    return payload.mode === "custom_message" && payload.data.message === config.overrideMessage;
  }
  if (override) {
    return payload.mode === override && chromeMatches(payload, withChrome(payload, config, slug, now));
  }
  if (config.showStudioBookings && STUDIO_MODES.has(payload.mode)) {
    return chromeMatches(payload, withChrome(payload, config, slug, now));
  }
  if (payload.mode !== (config.mode.trim() || "idle")) return false;
  return chromeMatches(payload, withChrome(payload, config, slug, now));
}

/** Open-sign numbers follow the film-stats schedule. Film stats already refreshes them. */
function statsStale(input: ReconcileDisplayInput, mode: string | undefined): boolean {
  if (input.slug !== FRONT_WINDOW_SLUG) return false;
  if (!input.config.isEnabled) return false;
  if (mode === "custom_message" || mode === "film_stats") return false;
  const setting = resolveOpenSignMode({
    slug: input.slug,
    openSignMode: input.config.openSignMode,
    openSignUntil: input.config.openSignUntil,
    legacyEnabled: input.config.showOpenSign,
    now: input.now,
  });
  if (setting !== "auto" && setting !== "on") return false;
  const best = newestStats(input);
  // All-null figures are the placeholder painted before a fetch, not a real snapshot.
  if (!best || !Object.values(best.stats).some((value) => value !== null)) return true;
  return !displayContentFresh({ mode: "film_stats", fetchedAt: best.fetchedAt, now: input.now });
}

function keep(input: ReconcileDisplayInput, fetchContent: boolean): ReconcileDisplayResult {
  return {
    payload: null,
    fetchedAt: input.current?.fetchedAt ?? null,
    fetchContent,
    bypassCache: fetchContent,
    reschedule: false,
  };
}

function show(
  input: ReconcileDisplayInput,
  payload: DisplayPayload,
  fetchedAt: number,
  fetchContent: boolean,
): ReconcileDisplayResult {
  return {
    payload,
    fetchedAt,
    fetchContent,
    bypassCache: fetchContent,
    reschedule: input.current?.payload.mode !== payload.mode,
  };
}

/**
 * Decide what a config poll should do.
 * Heavy film data is reused when it is still inside its schedule. A mode
 * whose copy is missing or stale asks for one payload fetch.
 */
export function reconcileDisplayConfig(input: ReconcileDisplayInput): ReconcileDisplayResult {
  if (
    !input.previousConfig
    && input.current
    && payloadMatchesConfig(input.current.payload, input.config, input.slug, input.now)
  ) {
    return keep(input, statsStale(input, input.current.payload.mode));
  }

  const identityChanged = !input.previousConfig
    || displayConfigContentKey(input.previousConfig) !== displayConfigContentKey(input.config);

  if (!identityChanged && input.current) {
    const patched = withChrome(input.current.payload, input.config, input.slug, input.now);
    const fetchContent = statsStale(input, patched.mode);
    if (chromeMatches(input.current.payload, patched)) return keep(input, fetchContent);
    return show(input, patched, input.current.fetchedAt, fetchContent);
  }

  const commanded = commandedMode(input.config);
  if (commanded === null) return keep(input, true);

  // Idle and a custom message are complete on the row. Departures, studio
  // sessions, and film status still need a payload fetch.
  if (commanded === "idle" || commanded === "custom_message") {
    const payload = buildResolved(input);
    return show(input, payload, input.now.getTime(), statsStale(input, payload.mode));
  }

  if (!SLOW_MODES.has(commanded)) return keep(input, true);

  const cached = modeEntry(input, commanded);
  const fresh = cached !== null && displayContentFresh({
    mode: commanded,
    fetchedAt: cached.fetchedAt,
    now: input.now,
  });
  if (!fresh || !cached) return keep(input, true);

  const payload = buildResolved({
    ...input,
    modes: { ...input.modes, [commanded]: cached },
  });
  const fetchContent = commanded !== "film_stats" && statsStale(input, payload.mode);
  return show(input, payload, cached.fetchedAt, fetchContent);
}

export function readModeCache(value: unknown): Partial<Record<string, ModeCacheEntry>> {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const modes: Partial<Record<string, ModeCacheEntry>> = {};
  for (const mode of SLOW_MODES) {
    const entry = record[mode];
    if (!entry || typeof entry !== "object") continue;
    const fetchedAt = (entry as { fetchedAt?: unknown }).fetchedAt;
    const data = (entry as { data?: unknown }).data;
    if (typeof fetchedAt !== "number" || !Number.isFinite(fetchedAt)) continue;
    if (!data || typeof data !== "object" || Array.isArray(data)) continue;
    modes[mode] = { fetchedAt, data: data as Record<string, unknown> };
  }
  return modes;
}

export function readOpenSignStatsCache(value: unknown): OpenSignStatsCache | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { fetchedAt?: unknown; stats?: unknown };
  if (typeof record.fetchedAt !== "number" || !Number.isFinite(record.fetchedAt)) return null;
  return { fetchedAt: record.fetchedAt, stats: sanitizeOpenSignStats(record.stats) };
}

export function readCachedConfig(value: unknown): DisplayConfig | null {
  if (!isDisplayConfig(value)) return null;
  return {
    mode: value.mode,
    theme: value.theme,
    isEnabled: value.isEnabled,
    overrideMode: value.overrideMode,
    overrideMessage: value.overrideMessage,
    showStudioBookings: value.showStudioBookings,
    openSignMode: value.openSignMode,
    openSignUntil: value.openSignUntil,
    showOpenSign: value.showOpenSign,
    studioInfoLines: linesOf(value.studioInfoLines),
    studioCheckoutLines: linesOf(value.studioCheckoutLines),
    refreshSeconds: value.refreshSeconds,
    buildId: value.buildId,
  };
}
