"use client";

import { useEffect, useRef, useState } from "react";
import {
  DISPLAY_RELOAD_STORAGE_KEY,
  clampRefreshSeconds,
  displayNeedsReload,
  displayUsesCrtTheme,
  isDisplayPayload,
  toPublicDisplayPayload,
  type DisplayPayload,
} from "@/lib/display";
import CrtGreenScreen from "@/components/display/CrtGreenScreen";
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

export default function DisplayPlayer({
  slug,
  initial,
  loadedBuildId,
  preview = false,
}: {
  slug: string;
  initial: DisplayPayload | null;
  /** Build id baked into this page load. Later polls compare against it. */
  loadedBuildId: string;
  preview?: boolean;
}) {
  const [payload, setPayload] = useState<DisplayPayload | null>(initial);
  const [missing, setMissing] = useState(false);
  const payloadRef = useRef(payload);
  const refreshSeconds = clampRefreshSeconds(payload?.refreshSeconds ?? initial?.refreshSeconds);

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;

    async function tick() {
      try {
        const response = await fetch(`/api/displays/${encodeURIComponent(slug)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) {
          const body: unknown = await response.json();
          if (isDisplayPayload(body)) {
            const next = toPublicDisplayPayload(body);
            const now = Date.now();
            if (displayNeedsReload({
              loadedBuildId,
              payloadBuildId: next.buildId,
              mode: next.mode,
              now,
              lastReloadAt: lastReloadAt(),
            })) {
              rememberReload(now);
              window.location.reload();
              return;
            }
            setPayload(next);
            setMissing(false);
          }
        } else if (response.status === 404 && !payloadRef.current) {
          setMissing(true);
        }
      } catch {
        // Keep the last good screen. A failed poll must not blank the kiosk.
      }

      if (preview || controller.signal.aborted) return;
      try {
        await fetch(`/api/displays/${encodeURIComponent(slug)}/heartbeat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ appVersion: "phase1" }),
          signal: controller.signal,
        });
      } catch {
        // The next poll will try again.
      }
    }

    void tick();
    timer = window.setInterval(() => { void tick(); }, refreshSeconds * 1000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [slug, refreshSeconds, preview, loadedBuildId]);

  const screen = payload ?? IDLE;
  const notice = missing && !payload ? "This screen is not set up yet." : null;
  if (screen.mode === "film_stats" || screen.mode === "film_status") {
    return <YoursCleanScreen payload={screen} notice={notice} />;
  }
  if (displayUsesCrtTheme(screen.mode) || screen.theme === "crt-green") {
    return <CrtGreenScreen payload={screen} notice={notice} />;
  }
  return <YoursCleanScreen payload={screen} notice={notice} />;
}
