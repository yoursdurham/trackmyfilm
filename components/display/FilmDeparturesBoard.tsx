"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ArrivalRow, DepartureRow, FilmDepartures } from "@/lib/film-departures";

/** Fixed page size. Text stays this large; extra names turn the page. */
const ROWS_PER_PAGE = 8;
const PAGE_DWELL_MS = 10_000;
const AMBER = "#FFC627";

/**
 * Tuned for the ~870px live area on studio-vertical (1080 minus the 210px
 * dead strip). Fixed tracks fit the longest status, gate, and column label
 * in a normal-width bold sans; the name track takes whatever is left,
 * including the width recovered from the narrower dead strip.
 * FROM is omitted: every arrival is LAB, and the heading already says so.
 */
const COL_GAP = "0.3rem";
const TILE_FONT = "1.6rem";
const DEPARTURE_COLUMNS = "5.5rem 6.3rem minmax(0,1fr) 5rem 6.9rem 11.3rem";
const ARRIVAL_COLUMNS = "minmax(0,1fr) 5rem 6.9rem 11.3rem";

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

/** Shrinks a single line until it fits its box. Never ellipsizes. */
function FitLine({
  children,
  max,
  min = "0.8rem",
  align = "left",
  field,
  className = "",
  style,
}: {
  children: string;
  max: string;
  min?: string;
  align?: "left" | "right" | "center";
  field?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fit = () => {
      el.style.fontSize = max;
      const maxPx = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = min;
      const minPx = parseFloat(getComputedStyle(el).fontSize);
      let size = maxPx;
      el.style.fontSize = `${size}px`;
      let guard = 0;
      while (el.scrollWidth > el.clientWidth + 0.5 && size > minPx && guard < 24) {
        const ratio = el.clientWidth / Math.max(el.scrollWidth, 1);
        const next = Math.max(minPx, Math.floor(size * Math.min(ratio, 0.98)));
        size = next >= size ? Math.max(minPx, size - 1) : next;
        el.style.fontSize = `${size}px`;
        guard += 1;
      }
      if (el.scrollWidth > el.clientWidth + 1) el.dataset.overflow = "1";
      else delete el.dataset.overflow;
    };

    fit();
    const box = el.parentElement;
    if (!box) return;
    let lastWidth = box.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = box.clientWidth;
      if (width === lastWidth) return;
      lastWidth = width;
      fit();
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [children, max, min]);

  const textAlign = align === "right" ? "right" : align === "center" ? "center" : "left";
  return (
    <span
      ref={ref}
      data-board-field={field}
      className={`block w-full min-w-0 max-w-full whitespace-nowrap leading-none ${className}`}
      style={{ ...style, fontSize: max, textAlign }}
    >
      {children}
    </span>
  );
}

function Tile({
  children,
  align = "left",
  tone = "white",
  alt = false,
  field,
}: {
  children: string;
  align?: "left" | "right" | "center";
  tone?: "white" | "amber";
  alt?: boolean;
  field?: string;
}) {
  return (
    <div className={`airport-tile relative flex h-full min-w-0 items-center overflow-hidden px-2 ${alt ? "airport-tile-alt" : ""}`}>
      <FitLine
        max={TILE_FONT}
        min="0.85rem"
        align={align}
        field={field}
        className="relative z-[1]"
        style={{ color: tone === "amber" ? AMBER : "#f7f8fa" }}
      >
        {children}
      </FitLine>
    </div>
  );
}

function ColumnLabels({ columns, labels }: { columns: string; labels: { text: string; align?: "left" | "right" | "center" }[] }) {
  return (
    <div className="grid shrink-0 items-end" style={{ gridTemplateColumns: columns, columnGap: COL_GAP }}>
      {labels.map((label) => (
        <span key={label.text} className="block min-w-0 px-2 pb-2">
          <FitLine
            max="0.68rem"
            min="0.5rem"
            align={label.align ?? "left"}
            field="label"
            className="tracking-[0.04em] text-white/80"
          >
            {label.text}
          </FitLine>
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
    <div className="airport-flap grid h-full min-h-0" style={{ gridTemplateColumns: DEPARTURE_COLUMNS, columnGap: COL_GAP, perspective: "800px" }}>
      <Tile alt={alt} tone="amber">{row.time}</Tile>
      <Tile alt={alt} tone="amber">{row.destination}</Tile>
      <Tile alt={alt} field="name">{row.name}</Tile>
      <Tile alt={alt} align="right">{String(row.rolls)}</Tile>
      <Tile alt={alt} tone="amber" align="right">{row.gate}</Tile>
      <Tile alt={alt} tone="amber" align="right" field="status">{row.status}</Tile>
    </div>
  );
}

function ArrivalFlap({ row, alt }: { row: ArrivalRow; alt: boolean }) {
  return (
    <div className="airport-flap grid h-full min-h-0" style={{ gridTemplateColumns: ARRIVAL_COLUMNS, columnGap: COL_GAP, perspective: "800px" }}>
      <Tile alt={alt} field="name">{row.name}</Tile>
      <Tile alt={alt} align="right">{String(row.rolls)}</Tile>
      <Tile alt={alt} tone="amber" align="right">{row.expected}</Tile>
      <Tile alt={alt} tone="amber" align="right" field="status">{row.status}</Tile>
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
    <section className="flex min-h-0 flex-1 flex-col pt-[2vh]">
      <div className="mb-[1vh] flex shrink-0 items-center justify-between gap-3">
        <h2 className="flex min-w-0 flex-1 items-center gap-3 leading-none tracking-[0.08em]" style={{ color: AMBER }}>
          <Plane className={`h-9 w-9 shrink-0 ${planeClass}`} />
          <span className="block min-w-0 flex-1">
            <FitLine max="2.05rem" min="1.15rem" field="title">{title}</FitLine>
          </span>
        </h2>
        {pageLabel ? (
          <p className="shrink-0 whitespace-nowrap text-[1rem] tracking-[0.14em] text-white/80" data-departures-page>
            {pageLabel}
          </p>
        ) : null}
      </div>
      {empty ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-2">
          <FitLine max="2.2rem" min="1.2rem" align="center" field="title" className="tracking-[0.12em] text-white/85">
            {empty}
          </FitLine>
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
    <div data-departures-board className="absolute inset-0 flex min-h-0 flex-col overflow-hidden px-3 pt-[1.8vh] pb-[1.4vh]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/15 pb-[1.4vh]">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Plane className="h-11 w-11 shrink-0" />
          <h1 className="min-w-0 flex-1 leading-[1.08] tracking-[0.03em]">
            <FitLine max="1.45rem" min="0.95rem" field="title">Yours, Durham</FitLine>
            <FitLine max="1.45rem" min="0.95rem" field="title" className="mt-1">· Film Terminal</FitLine>
          </h1>
        </div>
        <div className="shrink-0 text-right">
          <p className="whitespace-nowrap text-[2.2rem] leading-none tabular-nums" style={{ color: AMBER }} data-board-field="title">
            {now ? formatEt(now) : "\u00a0"}
          </p>
          <p className="mt-1.5 whitespace-nowrap text-[1.02rem] tracking-[0.08em] text-white/85" data-board-field="title">
            {`Next lab run ${board.nextLabRun || "—"}`}
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
          style={{ gridTemplateRows: `repeat(${ROWS_PER_PAGE}, minmax(0, 1fr))`, rowGap: "0.45rem" }}
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
            { text: "Passenger" },
            { text: "Rolls", align: "right" },
            { text: "Expected", align: "right" },
            { text: "Status", align: "right" },
          ]}
        />
        <div
          className="grid min-h-0 flex-1"
          style={{ gridTemplateRows: `repeat(${ROWS_PER_PAGE}, minmax(0, 1fr))`, rowGap: "0.45rem" }}
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

      <footer className="mt-[1.2vh] shrink-0 border-t border-white/15 pt-[1.1vh]">
        <div data-board-footer className="flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 flex-1">
            <FitLine max="1.05rem" min="0.7rem" field="footer">{countLabel(board.people, "Person", "People")}</FitLine>
          </span>
          <span className="min-w-0 flex-1">
            <FitLine max="1.05rem" min="0.7rem" align="center" field="footer">{`${countLabel(board.studioRolls, "Roll", "Rolls")} at studio`}</FitLine>
          </span>
          <span className="min-w-0 flex-1">
            <FitLine max="1.05rem" min="0.7rem" align="center" field="footer">{`${countLabel(board.labRolls, "Roll", "Rolls")} at lab`}</FitLine>
          </span>
          <span className="min-w-0 flex-1">
            <FitLine max="1.05rem" min="0.7rem" align="right" field="footer" style={{ color: AMBER }}>
              {countLabel(board.landedRolls, "Landed today", "Landed today")}
            </FitLine>
          </span>
        </div>
      </footer>
    </div>
  );
}
