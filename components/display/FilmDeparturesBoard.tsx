"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ArrivalRow, DepartureRow, FilmDepartures } from "@/lib/film-departures";

/** Fixed page size. Text stays this large; extra names turn the page. */
const ROWS_PER_PAGE = 8;
const PAGE_DWELL_MS = 10_000;
const AMBER = "#FFC627";

const DEPARTURE_COLUMNS = "8.2rem 8.6rem minmax(0,1fr) 5.2rem 8rem 13.4rem";
const ARRIVAL_COLUMNS = "8.2rem minmax(0,1fr) 5.2rem 8.8rem 12.6rem";

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
  return `${time} ET`;
}

function Plane({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}

function Tile({
  children,
  align = "left",
  tone = "white",
  alt = false,
  truncate = false,
}: {
  children: string;
  align?: "left" | "right" | "center";
  tone?: "white" | "amber";
  alt?: boolean;
  truncate?: boolean;
}) {
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <div className={`airport-tile relative flex h-full min-w-0 items-center overflow-hidden px-2 ${justify} ${alt ? "airport-tile-alt" : ""}`}>
      <span
        className={`relative z-[1] text-[2.15rem] leading-none ${truncate ? "min-w-0 truncate" : "whitespace-nowrap"}`}
        style={{ color: tone === "amber" ? AMBER : "#f7f8fa" }}
      >
        {children}
      </span>
    </div>
  );
}

function ColumnLabels({ columns, labels }: { columns: string; labels: { text: string; align?: "left" | "right" | "center" }[] }) {
  return (
    <div className="grid shrink-0 items-end" style={{ gridTemplateColumns: columns, columnGap: "0.7rem" }}>
      {labels.map((label) => (
        <span
          key={label.text}
          className={`whitespace-nowrap overflow-hidden px-2 pb-2 text-[0.92rem] leading-none tracking-[0.14em] text-white/80 ${label.align === "right" ? "text-right" : label.align === "center" ? "text-center" : "text-left"}`}
        >
          {label.text}
        </span>
      ))}
    </div>
  );
}

function usePage(count: number) {
  const pageCount = Math.max(1, Math.ceil(count / ROWS_PER_PAGE));
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (pageCount <= 1) return;
    const id = window.setInterval(() => {
      setPage((current) => (current + 1) % pageCount);
    }, PAGE_DWELL_MS);
    return () => window.clearInterval(id);
  }, [pageCount]);
  const safePage = pageCount <= 1 ? 0 : page % pageCount;
  return { pageCount, safePage };
}

function DepartureFlap({ row, alt }: { row: DepartureRow; alt: boolean }) {
  return (
    <div className="airport-flap grid h-full min-h-0" style={{ gridTemplateColumns: DEPARTURE_COLUMNS, columnGap: "0.7rem", perspective: "800px" }}>
      <Tile alt={alt} tone="amber">{row.time}</Tile>
      <Tile alt={alt} tone="amber">{row.destination}</Tile>
      <Tile alt={alt} truncate>{row.name}</Tile>
      <Tile alt={alt} align="right">{String(row.rolls)}</Tile>
      <Tile alt={alt} tone="amber" align="right">{row.gate}</Tile>
      <Tile alt={alt} tone="amber" align="right">{row.status}</Tile>
    </div>
  );
}

function ArrivalFlap({ row, alt }: { row: ArrivalRow; alt: boolean }) {
  return (
    <div className="airport-flap grid h-full min-h-0" style={{ gridTemplateColumns: ARRIVAL_COLUMNS, columnGap: "0.7rem", perspective: "800px" }}>
      <Tile alt={alt} tone="amber">{row.from}</Tile>
      <Tile alt={alt} truncate>{row.name}</Tile>
      <Tile alt={alt} align="right">{String(row.rolls)}</Tile>
      <Tile alt={alt} tone="amber" align="right">{row.expected}</Tile>
      <Tile alt={alt} tone="amber" align="right">{row.status}</Tile>
    </div>
  );
}

function SectionFrame({
  title,
  planeClass,
  pageLabel,
  empty,
  children,
}: {
  title: string;
  planeClass: string;
  pageLabel: string | null;
  empty: string | null;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col pt-[2.2vh]">
      <div className="mb-[1.2vh] flex shrink-0 items-center justify-between gap-6">
        <h2 className="flex items-center gap-4 text-[2.35rem] leading-none tracking-[0.12em]" style={{ color: AMBER }}>
          <Plane className={`h-10 w-10 ${planeClass}`} />
          {title}
        </h2>
        {pageLabel ? (
          <p className="shrink-0 whitespace-nowrap text-[1.15rem] tracking-[0.18em] text-white/80" data-departures-page>
            {pageLabel}
          </p>
        ) : null}
      </div>
      {empty ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <p className="text-[2.4rem] tracking-[0.16em] text-white/85">{empty}</p>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function FilmDeparturesBoard({ board }: { board: FilmDepartures }) {
  const now = useEtClock();
  const departures = usePage(board.departures.length);
  const arrivals = usePage(board.arrivals.length);
  const departureStart = departures.safePage * ROWS_PER_PAGE;
  const arrivalStart = arrivals.safePage * ROWS_PER_PAGE;
  const departureRows = board.departures.slice(departureStart, departureStart + ROWS_PER_PAGE);
  const arrivalRows = board.arrivals.slice(arrivalStart, arrivalStart + ROWS_PER_PAGE);

  return (
    <div data-departures-board className="absolute inset-0 flex min-h-0 flex-col overflow-hidden px-[2.4vw] pt-[2vh] pb-[1.6vh]">
      <header className="flex shrink-0 items-center justify-between gap-8 border-b border-white/15 pb-[1.6vh]">
        <div className="flex min-w-0 items-center gap-5">
          <Plane className="h-14 w-14 shrink-0" />
          <h1 className="truncate text-[2.15rem] leading-none tracking-[0.08em]">
            Yours, Durham Film Terminal
          </h1>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[2.6rem] leading-none tabular-nums" style={{ color: AMBER }}>
            {now ? formatEt(now) : "\u00a0"}
          </p>
          <p className="mt-2 whitespace-nowrap text-[1.15rem] tracking-[0.14em] text-white/85">
            Next lab run {board.nextLabRun || "—"}
          </p>
        </div>
      </header>

      <SectionFrame
        title="Departures → Lab"
        planeClass="-rotate-35"
        pageLabel={departures.pageCount > 1 ? `Page ${departures.safePage + 1}/${departures.pageCount}` : null}
        empty={board.departures.length === 0 ? "No scheduled departures" : null}
      >
        <ColumnLabels
          columns={DEPARTURE_COLUMNS}
          labels={[
            { text: "Time" },
            { text: "Destination" },
            { text: "Passenger" },
            { text: "Rolls", align: "right" },
            { text: "Gate", align: "right" },
            { text: "Status", align: "right" },
          ]}
        />
        <div
          className="grid min-h-0 flex-1"
          style={{ gridTemplateRows: `repeat(${ROWS_PER_PAGE}, minmax(0, 1fr))`, rowGap: "0.55rem" }}
        >
          {Array.from({ length: ROWS_PER_PAGE }, (_, index) => {
            const row = departureRows[index];
            if (!row) return <div key={`dep-empty-${index}`} />;
            return (
              <DepartureFlap
                key={`${departureStart + index}-${row.name}-${row.rolls}-${row.gate}-${row.status}`}
                row={row}
                alt={index % 2 === 1}
              />
            );
          })}
        </div>
      </SectionFrame>

      <SectionFrame
        title="Arrivals ← Lab"
        planeClass="rotate-[145deg]"
        pageLabel={arrivals.pageCount > 1 ? `Page ${arrivals.safePage + 1}/${arrivals.pageCount}` : null}
        empty={board.arrivals.length === 0 ? "No scheduled arrivals" : null}
      >
        <ColumnLabels
          columns={ARRIVAL_COLUMNS}
          labels={[
            { text: "From" },
            { text: "Passenger" },
            { text: "Rolls", align: "right" },
            { text: "Expected", align: "right" },
            { text: "Status", align: "right" },
          ]}
        />
        <div
          className="grid min-h-0 flex-1"
          style={{ gridTemplateRows: `repeat(${ROWS_PER_PAGE}, minmax(0, 1fr))`, rowGap: "0.55rem" }}
        >
          {Array.from({ length: ROWS_PER_PAGE }, (_, index) => {
            const row = arrivalRows[index];
            if (!row) return <div key={`arr-empty-${index}`} />;
            return (
              <ArrivalFlap
                key={`${arrivalStart + index}-${row.name}-${row.rolls}-${row.expected}-${row.status}`}
                row={row}
                alt={index % 2 === 1}
              />
            );
          })}
        </div>
      </SectionFrame>

      <footer className="mt-[1.4vh] shrink-0 border-t border-white/15 pt-[1.3vh]">
        <div className="flex flex-nowrap items-center justify-between gap-4 overflow-hidden text-[1.2rem] tracking-[0.08em]">
          <span className="whitespace-nowrap">{countLabel(board.people, "Person", "People")}</span>
          <span className="whitespace-nowrap">{countLabel(board.studioRolls, "Roll", "Rolls")} at studio</span>
          <span className="whitespace-nowrap">{countLabel(board.labRolls, "Roll", "Rolls")} at lab</span>
          <span className="whitespace-nowrap" style={{ color: AMBER }}>
            {countLabel(board.landedRolls, "Landed today", "Landed today")}
          </span>
        </div>
      </footer>
    </div>
  );
}
