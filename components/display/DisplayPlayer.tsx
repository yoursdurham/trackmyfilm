"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cachedDisplaySnapshot, readDisplayCache, subscribeDisplayCache, writeDisplayCache } from "@/lib/display-cache";
import {
  displayConfigContentKey,
  isDisplayConfig,
  reconcileDisplayConfig,
  type ReconcileDisplayResult,
} from "@/lib/display-config";
import { HEARTBEAT_WRITE_INTERVAL_MS } from "@/lib/display-heartbeat";
import {
  DISPLAY_CONFIG_POLL_MS,
  DISPLAY_REFRESH_QUERY,
  DISPLAY_REFRESH_RETRY_MS,
  displayPollDelayMs,
  planDisplaySync,
  type DisplaySyncPlan,
} from "@/lib/display-schedule";
import {
  DISPLAY_RELOAD_STORAGE_KEY,
  clampRefreshSeconds,
  displayNeedsReload,
  displaySafeArea,
  AIRPORT_THEME,
  displayUsesAirportTheme,
  displayUsesCrtTheme,
  isDisplayPayload,
  toPublicDisplayPayload,
  type DisplayOrientation,
  type DisplayPayload,
} from "@/lib/display";
import { nextRetailBoundary, resolveOpenSignMode, shouldShowOpenSign } from "@/lib/shop-hours";
import AirportBoard from "@/components/display/AirportBoard";
import CrtGreenScreen from "@/components/display/CrtGreenScreen";
import LandscapeScreen from "@/components/display/LandscapeScreen";
import OpenSignBoundary from "@/components/display/OpenSignBoundary";
import OpenSignScreen from "@/components/display/OpenSignScreen";
import YoursCleanScreen from "@/components/display/YoursCleanScreen";

const IDLE: DisplayPayload = {
  mode: "idle",
  theme: "crt-green",
  refreshSeconds: 30,
  buildId: "dev",
  data: {},
};

function lastReloadAt(): number | null {
  try {
    const raw = window.sessionStorage.getItem(DISPLAY_RELOAD_STORAGE_KEY);
    if (!raw) return null;
    const time = Number(raw);
    return Number.isFinite(time) ? time : null;
  } catch {
    return null;
  }
}

function rememberReload(now: number) {
  try {
    window.sessionStorage.setItem(DISPLAY_RELOAD_STORAGE_KEY, String(now));
  } catch {
    // A kiosk has sessionStorage. If it is blocked, reload anyway.
  }
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function forceRefreshRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).get(DISPLAY_REFRESH_QUERY) === "1";
  } catch {
    return false;
  }
}

function stripForceRefresh() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(DISPLAY_REFRESH_QUERY)) return;
    url.searchParams.delete(DISPLAY_REFRESH_QUERY);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // The next load still has the flag and will fetch once more.
  }
}

export default function DisplayPlayer({
  slug,
  initial,
  loadedBuildId,
  preview = false,
  orientation = "portrait",
}: {
  slug: string;
  initial: DisplayPayload | null;
  /** Build id baked into this page load. Later polls compare against it. */
  loadedBuildId: string;
  preview?: boolean;
  orientation?: DisplayOrientation;
}) {
  const [fetched, setFetched] = useState<DisplayPayload | null>(initial);
  const stored = useSyncExternalStore(subscribeDisplayCache, () => cachedDisplaySnapshot(slug), () => null);
  const payload = fetched ?? (preview ? null : stored?.payload ?? null);
  const [missing, setMissing] = useState(false);
  const payloadRef = useRef(payload);
  const initialRef = useRef(initial);

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;
    let configTimer = 0;
    let heartbeatTimer = 0;
    let cancelled = false;
    let reloading = false;

    const storage = browserStorage();
    const cached = !preview && storage ? readDisplayCache(storage, slug) : null;
    if (cached) payloadRef.current = cached.payload;
    let pollMs = clampRefreshSeconds(
      cached?.payload.refreshSeconds ?? initialRef.current?.refreshSeconds,
    ) * 1000;
    let contentFetchedAt = cached?.fetchedAt ?? (preview && initialRef.current ? Date.now() : null);
    let modes: NonNullable<typeof cached>["modes"] = { ...(cached?.modes ?? {}) };
    let openSignStats = cached?.openSignStats ?? null;
    let previousConfig = cached?.config ?? null;
    const forcedLoad = forceRefreshRequested();
    let requestId = 0;
    let contentRetryNotBefore = 0;
    let contentFailures = 0;
    let bypassNext = false;
    let inFlight: { id: number; bypass: boolean; promise: Promise<"ok" | "failed" | "stale"> } | null = null;

    if (payloadRef.current && contentFetchedAt !== null) {
      const seed = payloadRef.current;
      if (seed.mode === "film_menu" || seed.mode === "film_stats") {
        modes = { ...modes, [seed.mode]: { fetchedAt: contentFetchedAt, data: seed.data } };
      }
      if (seed.openSignStats && (!openSignStats || contentFetchedAt >= openSignStats.fetchedAt)) {
        openSignStats = { fetchedAt: contentFetchedAt, stats: seed.openSignStats };
      }
    }

    function clearTimers() {
      window.clearTimeout(timer);
      timer = 0;
    }

    function noteContentFailure() {
      contentFailures += 1;
      contentRetryNotBefore = Date.now() + displayPollDelayMs(
        contentFailures,
        DISPLAY_CONFIG_POLL_MS,
        DISPLAY_REFRESH_RETRY_MS,
      );
    }

    function noteContentSuccess() {
      contentFailures = 0;
      contentRetryNotBefore = 0;
    }

    function rememberContent(next: DisplayPayload, fetchedAt: number) {
      if (next.mode === "film_menu" || next.mode === "film_stats") {
        modes = { ...modes, [next.mode]: { fetchedAt, data: next.data } };
      }
      if (next.openSignStats && (!openSignStats || fetchedAt >= openSignStats.fetchedAt)) {
        openSignStats = { fetchedAt, stats: next.openSignStats };
      }
    }

    function persist(next: DisplayPayload, fetchedAt: number) {
      if (preview || !storage) return;
      writeDisplayCache(storage, slug, {
        fetchedAt,
        payload: next,
        modes,
        openSignStats,
        config: previousConfig,
      });
    }

    function showPayload(next: DisplayPayload, fetchedAt: number) {
      payloadRef.current = next;
      contentFetchedAt = fetchedAt;
      rememberContent(next, fetchedAt);
      setFetched(next);
      setMissing(false);
      persist(next, fetchedAt);
      pollMs = clampRefreshSeconds(next.refreshSeconds) * 1000;
    }

    async function pull(plan: DisplaySyncPlan, source: "schedule" | "config"): Promise<"ok" | "failed" | "stale"> {
      if (cancelled || reloading) return "stale";
      if (source === "config" && Date.now() < contentRetryNotBefore) return "failed";
      const bypass = plan.bypassCache || bypassNext;
      bypassNext = false;
      if (inFlight && inFlight.id === requestId && (inFlight.bypass || !bypass)) {
        return inFlight.promise;
      }

      const id = ++requestId;
      const promise = (async (): Promise<"ok" | "failed" | "stale"> => {
        try {
          const params = new URLSearchParams();
          if (preview) params.set("preview", "1");
          if (bypass) params.set(DISPLAY_REFRESH_QUERY, "1");
          const query = params.toString();
          const response = await fetch(`/api/displays/${encodeURIComponent(slug)}${query ? `?${query}` : ""}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (cancelled || id !== requestId) return "stale";
          if (!response.ok) {
            if (response.status === 404 && !payloadRef.current) setMissing(true);
            noteContentFailure();
            return "failed";
          }
          const body: unknown = await response.json();
          if (!isDisplayPayload(body) || cancelled || id !== requestId) {
            if (!cancelled && id === requestId) noteContentFailure();
            return id === requestId ? "failed" : "stale";
          }
          const next = toPublicDisplayPayload(body);
          const fetchedAt = Date.now();
          if (plan.checkReload && displayNeedsReload({
            loadedBuildId,
            payloadBuildId: next.buildId,
            mode: next.mode,
            now: fetchedAt,
            lastReloadAt: lastReloadAt(),
          })) {
            rememberReload(fetchedAt);
            reloading = true;
            window.location.reload();
            return "stale";
          }
          showPayload(next, fetchedAt);
          noteContentSuccess();
          if (forcedLoad) stripForceRefresh();
          return "ok";
        } catch {
          if (cancelled || controller.signal.aborted) return "stale";
          noteContentFailure();
          return "failed";
        }
      })();

      const slot = { id, bypass, promise };
      inFlight = slot;
      void promise.finally(() => {
        if (inFlight === slot) inFlight = null;
      });
      return promise;
    }

    function arm(mode: string | null, fetchedAt: number | null, force: boolean) {
      if (cancelled || reloading) return;
      clearTimers();
      const plan = planDisplaySync({
        mode,
        fetchedAt,
        now: new Date(),
        force,
        preview,
        pollMs,
      });

      if (plan.action === "hold") return;

      if (plan.action === "wait") {
        timer = window.setTimeout(() => arm(mode, fetchedAt, false), plan.waitMs);
        return;
      }

      void (async () => {
        const outcome = await pull(plan, "schedule");
        if (cancelled || reloading || outcome === "stale") return;
        if (outcome === "failed") {
          const wait = Math.max(1_000, contentRetryNotBefore - Date.now());
          timer = window.setTimeout(() => arm(mode, fetchedAt, force), wait);
          return;
        }
        if (force) stripForceRefresh();
        const shown = payloadRef.current;
        if (!shown) return;
        arm(shown.mode, Date.now(), false);
      })();
    }

    function followConfig(result: ReconcileDisplayResult) {
      if (!result.payload || result.fetchedAt === null) return;
      requestId += 1;
      showPayload(result.payload, result.fetchedAt);
      if (!result.reschedule) return;
      arm(result.payload.mode, result.fetchedAt, false);
    }

    async function configOnce(): Promise<"ok" | "retry" | "stop"> {
      if (cancelled || reloading) return "stop";
      try {
        const params = new URLSearchParams();
        if (preview) params.set("preview", "1");
        const query = params.toString();
        const response = await fetch(
          `/api/displays/${encodeURIComponent(slug)}/config${query ? `?${query}` : ""}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (cancelled) return "stop";
        if (!response.ok) {
          if (response.status === 404 && !payloadRef.current) setMissing(true);
          return response.status >= 500 || response.status === 429 ? "retry" : "ok";
        }
        const body: unknown = await response.json();
        if (!isDisplayConfig(body)) return "ok";
        const nowMs = Date.now();
        if (displayNeedsReload({
          loadedBuildId,
          payloadBuildId: body.buildId,
          mode: payloadRef.current?.mode ?? body.mode,
          now: nowMs,
          lastReloadAt: lastReloadAt(),
        })) {
          rememberReload(nowMs);
          reloading = true;
          window.location.reload();
          return "stop";
        }
        const configChanged = previousConfig !== null && (
          displayConfigContentKey(previousConfig) !== displayConfigContentKey(body)
          || previousConfig.menuRevision !== body.menuRevision
        );
        if (configChanged) noteContentSuccess();
        if (previousConfig && previousConfig.menuRevision !== body.menuRevision && modes?.film_menu) {
          const nextModes = { ...modes };
          delete nextModes.film_menu;
          modes = nextModes;
        }
        const currentPayload = payloadRef.current;
        const result = reconcileDisplayConfig({
          slug,
          config: body,
          now: new Date(),
          current: currentPayload && contentFetchedAt !== null
            ? { payload: currentPayload, fetchedAt: contentFetchedAt }
            : null,
          previousConfig,
          modes: modes ?? {},
          openSignStats,
        });
        const willFetch = result.fetchContent;
        if (result.payload || !result.fetchContent) previousConfig = body;
        followConfig(result);
        if (willFetch) {
          bypassNext = true;
          const outcome = await pull({
            action: "fetch",
            waitMs: 0,
            pollMs,
            heartbeat: false,
            checkReload: true,
            bypassCache: true,
          }, "config");
          if (outcome === "ok") {
            previousConfig = body;
            const shown = payloadRef.current;
            if (shown && !cancelled && !reloading) arm(shown.mode, contentFetchedAt, false);
          }
        }
        if (previousConfig && payloadRef.current && contentFetchedAt !== null) {
          persist(payloadRef.current, contentFetchedAt);
        }
        return "ok";
      } catch {
        if (cancelled || controller.signal.aborted) return "stop";
        return "retry";
      }
    }

    function sleep(ms: number, kind: "config" | "heartbeat") {
      return new Promise<void>((resolve) => {
        const id = window.setTimeout(resolve, ms);
        if (kind === "config") configTimer = id;
        else heartbeatTimer = id;
      });
    }

    async function configLoop() {
      let failures = 0;
      while (!cancelled && !reloading) {
        const started = Date.now();
        const outcome = await configOnce();
        if (cancelled || reloading || outcome === "stop") return;
        failures = outcome === "retry" ? failures + 1 : 0;
        const delay = displayPollDelayMs(failures, DISPLAY_CONFIG_POLL_MS);
        const wait = Math.max(0, delay - (Date.now() - started));
        await sleep(wait, "config");
      }
    }

    async function heartbeatLoop() {
      if (preview) return;
      let failures = 0;
      while (!cancelled && !reloading) {
        let ok = false;
        try {
          const response = await fetch(`/api/displays/${encodeURIComponent(slug)}/heartbeat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ appVersion: "phase1", mode: payloadRef.current?.mode ?? null }),
            signal: controller.signal,
          });
          ok = response.ok;
        } catch {
          ok = false;
        }
        if (cancelled || reloading) return;
        failures = ok ? 0 : failures + 1;
        const delay = ok
          ? HEARTBEAT_WRITE_INTERVAL_MS
          : displayPollDelayMs(failures, 60_000, HEARTBEAT_WRITE_INTERVAL_MS);
        await sleep(delay, "heartbeat");
      }
    }

    const bootMode = cached?.payload.mode ?? (preview ? initialRef.current?.mode ?? null : null);
    const bootFetchedAt = cached?.fetchedAt ?? (preview && initialRef.current ? Date.now() : null);
    arm(bootMode, bootFetchedAt, forceRefreshRequested());
    void configLoop();
    void heartbeatLoop();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimers();
      window.clearTimeout(configTimer);
      window.clearTimeout(heartbeatTimer);
    };
  }, [slug, preview, loadedBuildId]);

  const screen = payload ?? IDLE;
  const notice = missing && !payload ? "This screen is not set up yet." : null;
  const [shopNow, setShopNow] = useState(() => new Date());
  const openSignUntilRef = useRef<string | undefined>(screen.openSignUntil);
  useEffect(() => {
    openSignUntilRef.current = screen.openSignUntil;
  }, [screen.openSignUntil]);

  useEffect(() => {
    let timer = 0;
    const arm = () => {
      try {
        const now = new Date();
        setShopNow(now);
        const marks = [nextRetailBoundary(now).getTime()];
        if (openSignUntilRef.current) {
          const until = new Date(openSignUntilRef.current).getTime();
          if (Number.isFinite(until)) marks.push(until);
        }
        const wait = Math.min(Math.max(250, Math.min(...marks) - now.getTime() + 50), 60_000);
        timer = window.setTimeout(arm, wait);
      } catch (error) {
        console.error("[display-clock]", error);
        timer = window.setTimeout(arm, 60_000);
      }
    };
    arm();
    return () => window.clearTimeout(timer);
  }, []);

  const openSignSetting = resolveOpenSignMode({
    slug,
    openSignMode: screen.openSign,
    openSignUntil: screen.openSignUntil,
    legacyEnabled: screen.showOpenSign === true,
    now: shopNow,
  });
  const coverWithOpenSign = shouldShowOpenSign({
    slug,
    setting: openSignSetting,
    mode: screen.mode,
    now: shopNow,
  });
  const inset = displaySafeArea(slug, screen.mode).left;

  let normal;
  if (orientation === "landscape") {
    normal = <LandscapeScreen payload={screen} notice={notice} />;
  } else if (displayUsesAirportTheme(screen.mode) || screen.theme === AIRPORT_THEME) {
    normal = <AirportBoard payload={screen} notice={notice} />;
  } else if (screen.mode === "film_stats" || screen.mode === "film_status") {
    normal = <YoursCleanScreen payload={screen} notice={notice} />;
  } else if (displayUsesCrtTheme(screen.mode) || screen.theme === "crt-green") {
    normal = <CrtGreenScreen payload={screen} notice={notice} />;
  } else {
    normal = <YoursCleanScreen payload={screen} notice={notice} />;
  }
  const board = coverWithOpenSign
    ? <OpenSignBoundary fallback={normal}><OpenSignScreen stats={screen.openSignStats} /></OpenSignBoundary>
    : normal;

  return (
    <div
      className="flex h-dvh w-full overflow-hidden bg-black"
      data-display-orientation={orientation}
      data-display-safe-inset={inset}
    >
      {inset > 0 ? (
        <div
          aria-hidden
          data-display-deadzone=""
          className="h-full shrink-0 bg-black"
          style={{ width: inset }}
        />
      ) : null}
      <div
        className="relative h-full min-w-0 flex-1 overflow-hidden"
        style={{ containerType: "inline-size" }}
      >
        {board}
      </div>
    </div>
  );
}
