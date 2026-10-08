"use client";

import { useEffect, useRef, useState } from "react";
import {
  clampRefreshSeconds,
  isDisplayPayload,
  toPublicDisplayPayload,
  type DisplayPayload,
} from "@/lib/display";
import YoursCleanScreen from "@/components/display/YoursCleanScreen";

const IDLE: DisplayPayload = {
  mode: "idle",
  theme: "yours-clean",
  refreshSeconds: 30,
  data: {},
};

export default function DisplayPlayer({
  slug,
  initial,
  preview = false,
}: {
  slug: string;
  initial: DisplayPayload | null;
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
            setPayload(toPublicDisplayPayload(body));
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
  }, [slug, refreshSeconds, preview]);

  return (
    <YoursCleanScreen
      payload={payload ?? IDLE}
      notice={missing && !payload ? "This screen is not set up yet." : null}
    />
  );
}
