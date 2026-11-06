"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cachedDisplaySnapshot, readDisplayCache, subscribeDisplayCache, writeDisplayCache } from "@/lib/display-cache";
import {
  DISPLAY_REFRESH_QUERY,
  DISPLAY_REFRESH_RETRY_MS,
  displayRefreshPolicy,
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
    let interval = 0;
    let cancelled = false;
    let reloading = false;

    const storage = browserStorage();
    const cached = !preview && storage ? readDisplayCache(storage, slug) : null;
    if (cached) payloadRef.current = cached.payload;
    let pollMs = clampRefreshSeconds(
      cached?.payload.refreshSeconds ?? initialRef.current?.refreshSeconds,
    ) * 1000;

    function clearTimers() {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      timer = 0;
      interval = 0;
    }

    async function pull(plan: DisplaySyncPlan): Promise<DisplayPayload | null> {
      try {
        const params = new URLSearchParams();
        if (preview) params.set("preview", "1");
        if (plan.bypassCache) params.set(DISPLAY_REFRESH_QUERY, "1");
        const query = params.toString();
        const response = await fetch(`/api/displays/${encodeURIComponent(slug)}${query ? `?${query}` : ""}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (cancelled) return null;
        if (response.ok) {
          const body: unknown = await response.json();
          if (isDisplayPayload(body)) {
            const next = toPublicDisplayPayload(body);
            const fetchedAt = Date.now();
            if (!preview && storage) writeDisplayCache(storage, slug, { fetchedAt, payload: next });
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
              return null;
            }
            payloadRef.current = next;
            setFetched(next);
            setMissing(false);
            if (plan.heartbeat) {
              const heartbeat = new URLSearchParams();
              if (plan.bypassCache) heartbeat.set(DISPLAY_REFRESH_QUERY, "1");
              const heartbeatQuery = heartbeat.toString();
              try {
                await fetch(`/api/displays/${encodeURIComponent(slug)}/heartbeat${heartbeatQuery ? `?${heartbeatQuery}` : ""}`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ appVersion: "phase1", mode: next.mode }),
                  signal: controller.signal,
                });
              } catch {
                // The next refresh will try again.
              }
            }
            return next;
          }
        } else if (response.status === 404 && !payloadRef.current) {
          setMissing(true);
        }
      } catch {
        // Keep the last good screen. A failed fetch must not blank the kiosk.
      }
      return null;
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

      if (plan.action === "wait") {
        timer = window.setTimeout(() => arm(mode, fetchedAt, false), plan.waitMs);
        return;
      }

      if (plan.action === "poll") {
        pollMs = plan.pollMs;
        const run = () => { void pollOnce(); };
        void run();
        interval = window.setInterval(run, pollMs);
        return;
      }

      void (async () => {
        const next = await pull(plan);
        if (cancelled || reloading) return;
        if (!next) {
          timer = window.setTimeout(() => arm(mode, fetchedAt, force), DISPLAY_REFRESH_RETRY_MS);
          return;
        }
        if (force) stripForceRefresh();
        pollMs = clampRefreshSeconds(next.refreshSeconds) * 1000;
        arm(next.mode, Date.now(), false);
      })();
    }

    async function pollOnce() {
      if (cancelled || reloading) return;
      const next = await pull({
        action: "fetch",
        waitMs: 0,
        pollMs,
        heartbeat: !preview,
        checkReload: true,
        bypassCache: false,
      });
      if (cancelled || reloading || !next) return;
      if (displayRefreshPolicy(next.mode) !== "poll") {
        arm(next.mode, Date.now(), false);
        return;
      }
      const nextPoll = clampRefreshSeconds(next.refreshSeconds) * 1000;
      if (nextPoll !== pollMs) {
        pollMs = nextPoll;
        window.clearInterval(interval);
        interval = window.setInterval(() => { void pollOnce(); }, pollMs);
      }
    }

    const bootMode = cached?.payload.mode ?? (preview ? initialRef.current?.mode ?? null : null);
    const bootFetchedAt = cached?.fetchedAt ?? (preview && initialRef.current ? Date.now() : null);
    arm(bootMode, bootFetchedAt, forceRefreshRequested());

    return () => {
      cancelled = true;
      controller.abort();
      clearTimers();
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
