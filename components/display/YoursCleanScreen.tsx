"use client";

import { useEffect, useState } from "react";
import FilmStatsBoard from "@/components/display/FilmStatsBoard";
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
  const filmStats = payload.mode === "film_stats" && !notice;
  const screenMode = notice ? "idle" : filmStats ? "film_stats" : message ? "custom_message" : "idle";

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const clock = now ? studioClock(now) : null;

  return (
    <div
      data-display-mode={screenMode}
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
        <header className={`flex shrink-0 flex-col items-center ${filmStats ? "pt-[2.4vh]" : "pt-[7vh]"}`}>
          {/* Static file, not the image optimizer: one small request on a Pi 4. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Yours Durham"
            className={`rounded-[12%] object-cover shadow-lg ring-1 ring-black/10 ${
              filmStats
                ? "h-[5.2vh] w-[5.2vh] max-h-[150px] max-w-[150px]"
                : "h-[12vh] w-[12vh] max-h-[240px] max-w-[240px]"
            }`}
          />
          <p className={`font-medium tracking-[0.42em] text-[var(--accent-purple)] uppercase ${
            filmStats
              ? "mt-[1vh] text-[clamp(0.7rem,1.2vh,1.2rem)]"
              : "mt-[2.2vh] text-[clamp(0.8rem,2.1vw,1.7rem)]"
          }`}>
            Durham
          </p>
        </header>

        <main className={`flex min-h-0 flex-1 flex-col px-[2vw] text-center ${
          filmStats ? "w-full items-stretch py-[1.2vh]" : "items-center justify-center"
        }`}>
          {filmStats ? (
            <FilmStatsBoard data={payload.data} />
          ) : notice ? (
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

        <footer className={`flex shrink-0 flex-col items-center text-center ${filmStats ? "pb-[2.2vh]" : "pb-[6vh]"}`}>
          <p className={`min-h-[1em] leading-none font-medium tabular-nums ${
            filmStats ? "text-[clamp(1.4rem,2.4vh,2.6rem)]" : "text-[clamp(2.5rem,9vw,8vh)]"
          }`}>
            {clock?.time ?? "\u00a0"}
          </p>
          <p className={`min-h-[1.2em] text-[var(--text-muted)] ${
            filmStats
              ? "mt-[0.6vh] text-[clamp(0.85rem,1.3vh,1.4rem)]"
              : "mt-[1.4vh] text-[clamp(1rem,2.5vw,1.8rem)]"
          }`}>
            {clock?.day ?? "\u00a0"}
          </p>
          <p className={`tracking-[0.28em] text-[var(--accent-purple)] uppercase ${
            filmStats
              ? "mt-[1.4vh] text-[clamp(0.75rem,1.2vh,1.25rem)]"
              : "mt-[4vh] text-[clamp(0.85rem,2.2vw,1.5rem)]"
          }`}>
            35mm · 120 · 110
          </p>
        </footer>
      </div>
    </div>
  );
}
