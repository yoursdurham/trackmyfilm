"use client";

import { useEffect, useState } from "react";
import type { DepartureRow, FilmDepartures } from "@/lib/film-departures";

/** Fixed page size. Text stays this large; extra names turn the page. */
const ROWS_PER_PAGE = 10;
const PAGE_DWELL_MS = 10_000;
const COLUMNS = "minmax(0,1.55fr) 0.42fr 0.8fr 1.28fr 0.7fr";

function useEtClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function formatEt(date: Date) {
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
  return { time: `${time} ET`, day };
}

function countWord(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function Flap({ row }: { row: DepartureRow | null }) {
  if (!row) {
    return <div className="h-full border-b border-[#7CFF6B]/10" aria-hidden="true" />;
  }
  return (
    <div
      className="relative grid h-full items-center border-b border-[#7CFF6B]/30 px-[0.4vw] text-[clamp(1.35rem,1.55vh,2.15rem)] leading-none"
      style={{
        gridTemplateColumns: COLUMNS,
        backgroundImage: "linear-gradient(to bottom, rgba(124,255,107,0.07) 0%, rgba(124,255,107,0.02) 46%, rgba(0,0,0,0.72) 50%, rgba(0,0,0,0.72) 52%, rgba(124,255,107,0.04) 56%, rgba(0,0,0,0.2) 100%)",
      }}
    >
      <span className="truncate pr-[1vw] tracking-[0.04em]">{row.name}</span>
      <span className="text-center tabular-nums">{row.rolls}</span>
      <span className="text-center tracking-[0.12em]">{row.location}</span>
      <span className="text-center tracking-[0.06em] whitespace-nowrap">{row.status}</span>
      <span className="text-right tabular-nums tracking-[0.06em]">{row.since || "—"}</span>
    </div>
  );
}

export default function FilmDeparturesBoard({ board }: { board: FilmDepartures }) {
  const now = useEtClock();
  const clock = now ? formatEt(now) : null;
  const pageCount = Math.max(1, Math.ceil(board.rows.length / ROWS_PER_PAGE));
  const [page, setPage] = useState(0);
  const safePage = pageCount <= 1 ? 0 : page % pageCount;
  const start = safePage * ROWS_PER_PAGE;
  const visible = board.rows.slice(start, start + ROWS_PER_PAGE);
  const slots = Array.from({ length: ROWS_PER_PAGE }, (_, index) => visible[index] ?? null);

  useEffect(() => {
    if (pageCount <= 1) return;
    const id = window.setInterval(() => {
      setPage((current) => (current + 1) % pageCount);
    }, PAGE_DWELL_MS);
    return () => window.clearInterval(id);
  }, [pageCount]);

  return (
    <div data-departures-board className="flex h-full min-h-0 flex-col px-[3.2vw] pt-[2.4vh] pb-[2vh]">
      <header className="shrink-0">
        <div className="flex items-end justify-between gap-[3vw]">
          <div className="min-w-0">
            <h1 className="text-[clamp(2.8rem,4.6vh,5.6rem)] leading-none font-bold tracking-[0.14em]">
              Film departures
            </h1>
            <p className="mt-[1.1vh] text-[clamp(1.2rem,1.9vh,2.3rem)] tracking-[0.28em] opacity-80">
              Now processing
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[clamp(2rem,3.4vh,4.2rem)] leading-none font-bold tabular-nums">
              {clock?.time ?? "\u00a0"}
            </p>
            <p className="mt-[0.8vh] text-[clamp(1rem,1.6vh,1.9rem)] tracking-[0.14em] opacity-80">
              {clock?.day ?? "\u00a0"}
            </p>
          </div>
        </div>
        <div className="mt-[1.8vh] flex items-baseline justify-between gap-[2vw] text-[clamp(1.15rem,1.75vh,2.15rem)] tracking-[0.16em]">
          <span className="opacity-75">Next lab run</span>
          <span className="font-bold tabular-nums">{board.nextLabRun || "—"}</span>
        </div>
        <div className="mt-[1.2vh] h-px w-full bg-[#7CFF6B]/50" />
        <div
          className="grid px-[0.4vw] py-[1vh] text-[clamp(0.95rem,1.25vh,1.5rem)] tracking-[0.18em] opacity-70"
          style={{ gridTemplateColumns: COLUMNS }}
        >
          <span>Name</span>
          <span className="text-center">Rolls</span>
          <span className="text-center">Location</span>
          <span className="text-center">Status</span>
          <span className="text-right">Since</span>
        </div>
      </header>

      {board.rows.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
          <p className="text-[clamp(2rem,3.4vh,4rem)] leading-none font-bold tracking-[0.16em]">
            No film in process
          </p>
          <p className="mt-[2vh] max-w-[18ch] text-[clamp(1.15rem,1.8vh,2.1rem)] leading-snug tracking-[0.12em] opacity-75">
            The board is clear.
          </p>
        </div>
      ) : (
        <div
          className="grid min-h-0 flex-1"
          style={{ gridTemplateRows: `repeat(${ROWS_PER_PAGE}, minmax(0, 1fr))` }}
          aria-live="off"
        >
          {slots.map((row, index) => (
            <Flap key={row ? `${start + index}-${row.name}-${row.location}` : `empty-${index}`} row={row} />
          ))}
        </div>
      )}

      <footer className="shrink-0 pt-[1.2vh]">
        <div className="h-px w-full bg-[#7CFF6B]/50" />
        <div className="mt-[1.2vh] flex items-end justify-between gap-[2vw] text-[clamp(1.05rem,1.55vh,1.9rem)] tracking-[0.12em]">
          <p>
            {countWord(board.people, "Person", "People")}
            <span className="opacity-45">{"  ·  "}</span>
            {countWord(board.studioRolls, "Roll", "Rolls")} at studio
            <span className="opacity-45">{"  ·  "}</span>
            {countWord(board.labRolls, "Roll", "Rolls")} at lab
          </p>
          {pageCount > 1 ? (
            <p className="shrink-0 tabular-nums" data-departures-page>
              Page {safePage + 1}/{pageCount}
            </p>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
