"use client";

import { useEffect, useState } from "react";
import type { DisplayPayload } from "@/lib/display";

function messageSize(message: string) {
  const lines = message.split("\n");
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  if (longest <= 12 && lines.length === 1) return "clamp(3.25rem, 12vw, 11vh)";
  if (longest <= 42 && lines.length <= 4) return "clamp(2.2rem, 6.4vw, 6.5vh)";
  if (message.length <= 140) return "clamp(1.7rem, 4.6vw, 4.8vh)";
  return "clamp(1.25rem, 3.2vw, 3.4vh)";
}

function studioClock(date: Date) {
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
  return { time, day };
}

export default function YoursCleanScreen({
  payload,
  notice,
}: {
  payload: DisplayPayload;
  notice?: string | null;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const message = payload.mode === "custom_message" && typeof payload.data.message === "string"
    ? payload.data.message
    : null;

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const clock = now ? studioClock(now) : null;

  return (
    <div
      data-display-mode={message ? "custom_message" : "idle"}
      className="relative flex h-dvh w-full flex-col overflow-hidden bg-[var(--bg-main)] text-[var(--text-main)] select-none"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[4.2vw] min-w-8 bg-[var(--accent-tan)]"
        style={{
          backgroundImage: "radial-gradient(circle at center, #1f2937 0 4px, transparent 5px)",
          backgroundSize: "100% 4.6vh",
          backgroundRepeat: "repeat-y",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-[0.4vw] min-w-1 bg-[var(--accent-purple)]" />

      <div className="flex min-h-0 flex-1 flex-col pl-[8vw] pr-[6vw]">
        <header className="flex shrink-0 flex-col items-center pt-[7vh]">
          {/* Static file, not the image optimizer: one small request on a Pi 4. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Yours Durham"
            className="h-[12vh] w-[12vh] max-h-[240px] max-w-[240px] rounded-[12%] object-cover shadow-lg ring-1 ring-black/10"
          />
          <p className="mt-[2.2vh] text-[clamp(0.8rem,2.1vw,1.7rem)] font-medium tracking-[0.42em] text-[var(--accent-purple)] uppercase">
            Durham
          </p>
        </header>

        <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-[2vw] text-center">
          {notice ? (
            <p className="max-w-[18ch] text-[clamp(2rem,6vw,4.5rem)] leading-tight font-medium">
              {notice}
            </p>
          ) : message ? (
            <p
              className="max-w-full font-medium leading-[1.12] break-words whitespace-pre-wrap"
              style={{ fontSize: messageSize(message) }}
            >
              {message}
            </p>
          ) : (
            <div className="flex flex-col items-center">
              <p className="text-[clamp(0.85rem,2.2vw,1.6rem)] tracking-[0.38em] text-[var(--accent-green)] uppercase">
                The studio
              </p>
              <h1 className="mt-[2vh] text-[clamp(4rem,16vw,15vh)] leading-none font-semibold tracking-tight">
                Welcome
              </h1>
              <div className="mt-[3.5vh] h-px w-[22vw] bg-[var(--accent-purple)]" />
              <p className="mt-[3.5vh] max-w-[16ch] text-[clamp(1.4rem,3.6vw,2.6rem)] leading-snug text-[var(--text-muted)]">
                Make yourself at home.
              </p>
            </div>
          )}
        </main>

        <footer className="flex shrink-0 flex-col items-center pb-[6vh] text-center">
          <p className="min-h-[1em] text-[clamp(2.5rem,9vw,8vh)] leading-none font-medium tabular-nums">
            {clock?.time ?? "\u00a0"}
          </p>
          <p className="mt-[1.4vh] min-h-[1.2em] text-[clamp(1rem,2.5vw,1.8rem)] text-[var(--text-muted)]">
            {clock?.day ?? "\u00a0"}
          </p>
          <p className="mt-[4vh] text-[clamp(0.85rem,2.2vw,1.5rem)] tracking-[0.28em] text-[var(--accent-purple)] uppercase">
            35mm · 120 · 110
          </p>
        </footer>
      </div>
    </div>
  );
}
