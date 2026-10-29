"use client";

import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { YOURS_DARK_THEME, type DisplayPayload } from "@/lib/display";
import {
  formatDepartureName,
  sanitizeFilmDepartures,
  type ArrivalRow,
  type DepartureRow,
  type FilmDepartures,
} from "@/lib/film-departures";
import { sanitizeFilmMenu, type FilmMenu } from "@/lib/film-menu";
import { FILM_METRICS_CONFIG, labRunScheduleLabel } from "@/lib/film-metrics-config";
import { LANDSCAPE_DEPARTURE_ROWS } from "@/lib/display-layout";

const PAGE_DWELL_MS = 10_000;
const LandscapeDark = createContext(false);

function useDark() {
  return useContext(LandscapeDark);
}

function statusTone(status: string, dark: boolean) {
  if (!dark) return "";
  if (status === "LANDED" || status === "CHECKED IN") return "text-[#A1CC93]";
  if (status === "FINAL CALL" || status === "DELAYED") return "text-[#DDB1B1]";
  return "text-[#C5AED7]";
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

function useClock() {
  const [now, setNow] = useState<Date | null>(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function usePage(count: number) {
  const pageCount = Math.max(1, Math.ceil(count / LANDSCAPE_DEPARTURE_ROWS));
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (pageCount <= 1) return;
    const id = window.setInterval(() => {
      setPage((current) => (current + 1) % pageCount);
    }, PAGE_DWELL_MS);
    return () => window.clearInterval(id);
  }, [pageCount]);
  return { pageCount, page: pageCount <= 1 ? 0 : page % pageCount };
}

function textOf(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "string" ? value : "";
}

function linesOf(data: Record<string, unknown>, key: string) {
  const value = data[key];
  if (!Array.isArray(value)) return [];
  return value.filter((line): line is string => typeof line === "string" && line.trim().length > 0);
}

function countLabel(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.round(value));
  return "—";
}

function daysLabel(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return (Math.round(value * 10) / 10).toFixed(1);
  }
  return "—";
}

function peopleLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function windowName(value: string) {
  const formatted = formatDepartureName(value);
  return formatted || value.trim();
}

function Chrome({
  mode,
  children,
}: {
  mode: string;
  children: ReactNode;
}) {
  const now = useClock();
  const clock = now ? studioClock(now) : null;
  const dark = useDark();

  return (
    <div
      data-display-orientation="landscape"
      data-display-chrome="tmf"
      data-display-theme={dark ? "yours-dark" : "yours-clean"}
      data-display-mode={mode}
      className={dark
        ? "relative flex h-dvh w-full flex-col overflow-hidden bg-[#0a0a0a] font-jetbrains font-extrabold text-[#f4f1ea] select-none"
        : "relative flex h-dvh w-full flex-col overflow-hidden bg-[#FFF6D3] font-jetbrains text-neutral-900 select-none"}
    >
      <header className={dark
        ? "flex shrink-0 items-center justify-between gap-[2vw] border-b-[0.55vh] border-[#DDB1B1] bg-[#0a0a0a] px-[2.2vw] py-[1.4vh]"
        : "flex shrink-0 items-center justify-between gap-[2vw] bg-[#DDB1B1] px-[2.2vw] py-[1.4vh]"}>
        <div className="flex min-w-0 items-center gap-[1.2vw]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dark ? "/logo-on-dark.png" : "/logo.png"}
            alt="Yours Durham"
            className={dark
              ? "h-[8vh] w-[8vh] max-h-[120px] max-w-[120px] shrink-0 rounded-[18%] object-cover ring-1 ring-[#f4f1ea]/30"
              : "h-[8vh] w-[8vh] max-h-[120px] max-w-[120px] shrink-0 rounded-[18%] object-cover ring-1 ring-neutral-900/10"}
          />
          <p className="truncate text-[clamp(1.4rem,3.4vh,3.2rem)] leading-none font-bold tracking-[0.16em] uppercase">
            Yours Durham
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[clamp(1.8rem,5vh,4.6rem)] leading-none font-bold tabular-nums">
            {clock?.time ?? "\u00a0"}
          </p>
          <p className={`mt-[0.4vh] text-[clamp(0.85rem,1.8vh,1.6rem)] leading-none ${dark ? "font-bold" : ""}`}>
            {clock?.day ?? "\u00a0"}
          </p>
        </div>
      </header>
      <div className={dark
        ? "m-[1.1vh] flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.2vh] border-[0.7vh] border-[#DDB1B1] bg-[#0a0a0a] px-[1.6vw] py-[1.2vh]"
        : "m-[1.1vh] flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.2vh] border-[0.7vh] border-[#DDB1B1] bg-[#FFF6D3] px-[1.6vw] py-[1.2vh]"}>
        {children}
      </div>
    </div>
  );
}

function BoardColumn({
  column,
  title,
  pageLabel,
  empty,
  children,
}: {
  column: "departures" | "arrivals";
  title: string;
  pageLabel: string | null;
  empty: string | null;
  children: ReactNode;
}) {
  const dark = useDark();
  return (
    <section data-board-column={column} className="flex min-h-0 min-w-0 flex-col">
      <div className={`mb-[1vh] flex shrink-0 items-end justify-between gap-[1vw] border-b-[0.35vh] pb-[0.8vh] ${dark ? "border-[#f4f1ea]" : "border-[#DDB1B1]"}`}>
        <h2 className="text-[clamp(1.3rem,3.2vh,2.8rem)] leading-none font-bold tracking-[0.12em] uppercase">
          {title}
        </h2>
        {pageLabel ? (
          <p className="shrink-0 text-[clamp(0.8rem,1.8vh,1.5rem)] tracking-[0.12em] uppercase" data-departures-page>
            {pageLabel}
          </p>
        ) : null}
      </div>
      {empty ? (
        <p className="flex flex-1 items-center text-[clamp(1.4rem,3.6vh,3.2rem)] leading-tight font-bold tracking-[0.06em] uppercase">
          {empty}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

function DepartureLine({ row }: { row: DepartureRow }) {
  const dark = useDark();
  return (
    <div className={`grid h-full min-h-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-[1.4vw] border-b ${dark ? "border-[#f4f1ea]/80" : "border-[#DDB1B1]/70"}`}>
      <span className={`text-[clamp(1.1rem,2.8vh,2.4rem)] tabular-nums ${dark ? "font-bold" : ""}`}>{row.time}</span>
      <span data-board-field="name" className={`truncate text-[clamp(1.8rem,5.6vh,4.8rem)] leading-none tracking-[0.04em] ${dark ? "font-extrabold" : "font-bold"}`}>
        {row.name}
      </span>
      <span className={`text-right text-[clamp(1.1rem,2.8vh,2.4rem)] tabular-nums ${dark ? "font-bold" : ""}`}>{row.rolls}</span>
      <span className={`truncate text-right text-[clamp(0.95rem,2.3vh,2rem)] tracking-[0.08em] uppercase ${dark ? "font-extrabold" : "font-bold"} ${statusTone(row.status, dark)}`}>
        {row.status}
      </span>
    </div>
  );
}

function ArrivalLine({ row }: { row: ArrivalRow }) {
  const dark = useDark();
  return (
    <div className={`grid h-full min-h-0 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-[1.4vw] border-b ${dark ? "border-[#f4f1ea]/80" : "border-[#DDB1B1]/70"}`}>
      <span data-board-field="name" className={`truncate text-[clamp(1.8rem,5.6vh,4.8rem)] leading-none tracking-[0.04em] ${dark ? "font-extrabold" : "font-bold"}`}>
        {row.name}
      </span>
      <span className={`text-right text-[clamp(1.1rem,2.8vh,2.4rem)] tabular-nums ${dark ? "font-bold" : ""}`}>{row.rolls}</span>
      <span className={`text-right text-[clamp(1.05rem,2.5vh,2.1rem)] tabular-nums ${dark ? "font-bold" : ""}`}>{row.expected}</span>
      <span className={`truncate text-right text-[clamp(0.95rem,2.3vh,2rem)] tracking-[0.08em] uppercase ${dark ? "font-extrabold" : "font-bold"} ${statusTone(row.status, dark)}`}>
        {row.status}
      </span>
    </div>
  );
}

function DeparturesBody({ board }: { board: FilmDepartures }) {
  const dark = useDark();
  const departures = usePage(board.departures.length);
  const arrivals = usePage(board.arrivals.length);
  const departureStart = departures.page * LANDSCAPE_DEPARTURE_ROWS;
  const arrivalStart = arrivals.page * LANDSCAPE_DEPARTURE_ROWS;
  const departureRows = board.departures.slice(departureStart, departureStart + LANDSCAPE_DEPARTURE_ROWS);
  const arrivalRows = board.arrivals.slice(arrivalStart, arrivalStart + LANDSCAPE_DEPARTURE_ROWS);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="mb-[1vh] shrink-0 text-[clamp(1rem,2.4vh,2rem)] font-bold tracking-[0.08em] uppercase">
        {`Next lab run ${board.nextLabRun || "—"}`}
      </p>
      <div data-departures-layout="side-by-side" className="grid min-h-0 flex-1 grid-cols-2 gap-[2vw]">
        <BoardColumn
          column="departures"
          title="Departures"
          pageLabel={departures.pageCount > 1 ? `Page ${departures.page + 1}/${departures.pageCount}` : null}
          empty={board.departures.length === 0 ? "No scheduled departures" : null}
        >
          <div
            className="grid min-h-0 flex-1"
            style={{ gridTemplateRows: `repeat(${LANDSCAPE_DEPARTURE_ROWS}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: LANDSCAPE_DEPARTURE_ROWS }, (_, index) => {
              const row = departureRows[index];
              if (!row) return <div key={`dep-empty-${index}`} />;
              return <DepartureLine key={`${departureStart + index}-${row.name}-${row.status}`} row={row} />;
            })}
          </div>
        </BoardColumn>
        <BoardColumn
          column="arrivals"
          title="Arrivals"
          pageLabel={arrivals.pageCount > 1 ? `Page ${arrivals.page + 1}/${arrivals.pageCount}` : null}
          empty={board.arrivals.length === 0 ? "No scheduled arrivals" : null}
        >
          <div
            className="grid min-h-0 flex-1"
            style={{ gridTemplateRows: `repeat(${LANDSCAPE_DEPARTURE_ROWS}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: LANDSCAPE_DEPARTURE_ROWS }, (_, index) => {
              const row = arrivalRows[index];
              if (!row) return <div key={`arr-empty-${index}`} />;
              return <ArrivalLine key={`${arrivalStart + index}-${row.name}-${row.status}`} row={row} />;
            })}
          </div>
        </BoardColumn>
      </div>
      <footer data-board-footer className={`mt-[1vh] grid shrink-0 grid-cols-4 gap-[1vw] border-t-[0.35vh] pt-[1vh] text-[clamp(0.85rem,2vh,1.6rem)] font-bold tracking-[0.04em] uppercase ${dark ? "border-[#f4f1ea]" : "border-[#DDB1B1]"}`}>
        <span>{peopleLabel(board.people, "Person", "People")}</span>
        <span className="text-center">{`${peopleLabel(board.studioRolls, "Roll", "Rolls")} at studio`}</span>
        <span className="text-center">{`${peopleLabel(board.labRolls, "Roll", "Rolls")} at lab`}</span>
        <span className={`text-right ${dark ? "text-[#A1CC93]" : ""}`}>{peopleLabel(board.landedRolls, "Landed today", "Landed today")}</span>
      </footer>
    </div>
  );
}

function StatCard({
  label,
  children,
  note,
}: {
  label: string;
  children: ReactNode;
  note?: string;
}) {
  const dark = useDark();
  return (
    <section className={`flex min-h-0 min-w-0 flex-col rounded-[1vh] border-[0.35vh] px-[1vw] py-[1.4vh] ${dark ? "border-[#f4f1ea]" : "border-[#DDB1B1]"}`}>
      <h2 className="text-[clamp(0.8rem,1.8vh,1.5rem)] font-bold tracking-[0.16em] uppercase">{label}</h2>
      <div className="mt-[1.6vh] min-w-0">{children}</div>
      {note ? (
        <p className="mt-auto pt-[1.4vh] text-[clamp(0.75rem,1.5vh,1.3rem)] leading-snug">{note}</p>
      ) : null}
    </section>
  );
}

function Figure({ value, paired = false }: { value: string; paired?: boolean }) {
  const dark = useDark();
  return (
    <p className={`leading-none tabular-nums ${dark ? "font-extrabold" : "font-bold"} ${
      paired
        ? "text-[clamp(1.7rem,4.4vh,3.8rem)]"
        : "text-[clamp(2.8rem,8vh,7.5rem)]"
    }`}>
      {value}
    </p>
  );
}

function StatsBody({ data }: { data: Record<string, unknown> }) {
  const dark = useDark();
  const windowDays = FILM_METRICS_CONFIG.turnaroundWindowDays;
  const schedule = labRunScheduleLabel();
  return (
    <div data-stats-layout="landscape" className="grid min-h-0 flex-1 grid-cols-5 gap-[1.2vw]">
      <StatCard label="Rolls in process" note="Scan rolls in house or at the lab">
        <div data-stat="rolls-processing">
          <Figure value={countLabel(data.rollsProcessing)} />
        </div>
      </StatCard>
      <StatCard label="Received">
        <div data-stat="received" className="grid grid-cols-2 gap-[0.8vw]">
          <div>
            <Figure value={countLabel(data.receivedToday)} paired />
            <p className="mt-[0.6vh] text-[clamp(0.8rem,1.8vh,1.5rem)]">Today</p>
          </div>
          <div>
            <Figure value={countLabel(data.receivedThisWeek)} paired />
            <p className="mt-[0.6vh] text-[clamp(0.8rem,1.8vh,1.5rem)]">This week</p>
          </div>
        </div>
      </StatCard>
      <StatCard label="Scans sent">
        <div data-stat="scans-sent" className="grid grid-cols-2 gap-[0.8vw]">
          <div>
            <Figure value={countLabel(data.scansSentToday)} paired />
            <p className="mt-[0.6vh] text-[clamp(0.8rem,1.8vh,1.5rem)]">Today</p>
          </div>
          <div>
            <Figure value={countLabel(data.scansSentThisWeek)} paired />
            <p className="mt-[0.6vh] text-[clamp(0.8rem,1.8vh,1.5rem)]">This week</p>
          </div>
        </div>
      </StatCard>
      <StatCard label="Turnaround" note={`Received at lab to scans sent · last ${windowDays} days`}>
        <div data-stat="turnaround" className="grid grid-cols-2 gap-[0.8vw]">
          <div>
            <Figure value={daysLabel(data.averageColorTurnaroundDays)} paired />
            <p className="mt-[0.6vh] text-[clamp(0.8rem,1.8vh,1.5rem)]">Color · days</p>
          </div>
          <div>
            <Figure value={daysLabel(data.averageBwTurnaroundDays)} paired />
            <p className="mt-[0.6vh] text-[clamp(0.8rem,1.8vh,1.5rem)]">Black & white · days</p>
          </div>
        </div>
      </StatCard>
      <StatCard label="Next lab run" note={schedule || undefined}>
        <p data-stat="next-lab-run" className={`text-[clamp(1.5rem,3.2vh,2.8rem)] leading-tight ${dark ? "font-extrabold" : "font-bold"}`}>
          {typeof data.nextLabRun === "string" && data.nextLabRun.trim() ? data.nextLabRun : "—"}
        </p>
      </StatCard>
    </div>
  );
}

function scrollSeconds(menu: FilmMenu) {
  const lines = menu.banner.length
    + menu.sections.reduce((sum, section) => sum + section.items.length + 2, 0)
    + menu.notes.length
    + 4;
  return Math.min(240, Math.max(100, Math.round(lines * 1.4)));
}

function MenuCopy({ menu, hidden = false }: { menu: FilmMenu; hidden?: boolean }) {
  const dark = useDark();
  const midpoint = Math.ceil(menu.sections.length / 2);
  const columns = [menu.sections.slice(0, midpoint), menu.sections.slice(midpoint)];
  return (
    <div aria-hidden={hidden || undefined} className="pb-[8vh]">
      <h1 className="text-[clamp(1.8rem,4.4vh,4rem)] leading-none font-bold tracking-[0.08em] uppercase">
        {menu.title || "Your's film menu"}
      </h1>
      {menu.subtitle ? (
        <p className="mt-[1vh] text-[clamp(1rem,2.2vh,2rem)] tracking-[0.08em] uppercase">{menu.subtitle}</p>
      ) : null}
      {menu.banner.map((line) => (
        <p key={line} className="mt-[0.6vh] text-[clamp(0.95rem,2vh,1.7rem)] tracking-[0.06em] uppercase">{line}</p>
      ))}
      <div className="mt-[2vh] grid grid-cols-2 gap-[2vw]">
        {columns.map((sections, column) => (
          <div key={column}>
            {sections.map((section) => (
              <section key={section.title} className="mt-[2vh]">
                <h2 className={`border-b-[0.3vh] pb-[0.6vh] text-[clamp(1.2rem,2.8vh,2.4rem)] font-bold tracking-[0.1em] uppercase ${dark ? "border-[#C5AED7]" : "border-[#DDB1B1]"}`}>
                  {section.title}
                </h2>
                <ul className="mt-[0.8vh]">
                  {section.items.map((item, index) => (
                    <li
                      key={`${section.title}-${index}-${item.name}`}
                      className="flex items-baseline justify-between gap-[1vw] py-[0.35vh] text-[clamp(1rem,2.5vh,2.1rem)] leading-tight"
                    >
                      <span className="min-w-0">{item.name}</span>
                      <span className={`shrink-0 tabular-nums ${dark ? "font-extrabold text-[#A1CC93]" : "font-bold"}`}>{item.price}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ))}
      </div>
      {menu.notes.length > 0 ? (
        <div className="mt-[2vh]">
          {menu.notes.map((note, index) => (
            <p
              key={`${index}-${note.text}`}
              className={`mt-[1vh] ${note.heading ? "text-[clamp(1.2rem,2.6vh,2.2rem)] font-bold tracking-[0.1em] uppercase" : "text-[clamp(1rem,2.2vh,1.8rem)]"}`}
            >
              {note.text}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MenuBody({ menu }: { menu: FilmMenu }) {
  const seconds = scrollSeconds(menu);
  return (
    <div data-menu-layout="landscape" className="relative min-h-0 flex-1 overflow-hidden">
      <div
        className="crt-scroll absolute inset-x-0 top-0"
        style={{ "--crt-duration": `${seconds}s` } as CSSProperties}
      >
        <MenuCopy menu={menu} />
        <MenuCopy menu={menu} hidden />
      </div>
    </div>
  );
}

function StudioBody({ mode, data }: { mode: string; data: Record<string, unknown> }) {
  const firstName = windowName(textOf(data, "firstName"));
  const sessionType = textOf(data, "sessionType");
  const start = textOf(data, "start");
  const end = textOf(data, "end");
  const welcome = mode === "studio_welcome";
  const upcoming = mode === "studio_upcoming";
  const ending = mode === "studio_ending_soon";
  const info = welcome || mode === "studio_active" ? linesOf(data, "infoLines") : [];
  const checkout = ending ? linesOf(data, "checkoutLines") : [];
  const notes = info.length > 0 ? info : checkout;
  const kicker = upcoming ? "Up next" : welcome ? "Welcome" : ending ? "Ending soon" : "In session";
  const time = upcoming || welcome ? start : end ? `Until ${end}` : "";
  const noteTitle = checkout.length > 0 && info.length === 0 ? "Before you go" : "Studio info";

  return (
    <div data-studio-layout="landscape" className={`grid min-h-0 flex-1 items-center ${notes.length > 0 ? "grid-cols-2 gap-[3vw]" : ""}`}>
      <div className={notes.length > 0 ? "min-w-0" : "text-center"}>
        <p className="text-[clamp(1rem,2.4vh,2rem)] font-bold tracking-[0.22em] uppercase">{kicker}</p>
        {firstName ? (
          <h1 className="mt-[1vh] text-[clamp(3.5rem,12vh,10rem)] leading-none font-bold tracking-[0.04em] break-words">
            {firstName}
          </h1>
        ) : null}
        {sessionType ? (
          <p className="mt-[1.5vh] text-[clamp(1.3rem,3.2vh,2.8rem)] leading-snug">{sessionType}</p>
        ) : null}
        {time ? (
          <p className="mt-[1vh] text-[clamp(2rem,5vh,4.5rem)] leading-none font-bold tabular-nums">{time}</p>
        ) : null}
      </div>
      {notes.length > 0 ? (
        <section aria-label={noteTitle} data-studio-info={info.length > 0 ? "" : undefined} data-studio-checkout={checkout.length > 0 && info.length === 0 ? "" : undefined}>
          <h2 className="text-[clamp(1rem,2.2vh,1.8rem)] font-bold tracking-[0.18em] uppercase">{noteTitle}</h2>
          <ul className="mt-[1.5vh] space-y-[1.4vh]">
            {notes.map((line, index) => (
              <li key={`${index}-${line}`} className="text-[clamp(1.2rem,3vh,2.6rem)] leading-snug font-bold">
                {line}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function IdleBody({ notice, message }: { notice: string | null; message: string | null }) {
  const dark = useDark();
  return (
    <div data-idle-layout="landscape" className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
      {notice ? (
        <p className={`max-w-[22ch] text-[clamp(2rem,6vh,5rem)] leading-tight ${dark ? "font-extrabold" : "font-bold"}`}>{notice}</p>
      ) : message ? (
        <p className={`max-w-[24ch] text-[clamp(2rem,6.5vh,6rem)] leading-[1.05] whitespace-pre-wrap break-words ${dark ? "font-extrabold" : "font-bold"}`}>
          {message}
        </p>
      ) : (
        <>
          <p className="text-[clamp(1.1rem,2.6vh,2.2rem)] font-bold tracking-[0.28em] uppercase">The studio</p>
          <h1 className="mt-[1vh] text-[clamp(4rem,14vh,12rem)] leading-none font-bold tracking-[0.04em]">Welcome</h1>
          <p className={`mt-[2vh] text-[clamp(1.4rem,3.4vh,3rem)] ${dark ? "font-extrabold" : ""}`}>Make yourself at home.</p>
          <p className="mt-[3vh] text-[clamp(1rem,2.4vh,2rem)] font-bold tracking-[0.22em] uppercase">35mm · 120 · 110</p>
        </>
      )}
    </div>
  );
}

export default function LandscapeScreen({
  payload,
  notice,
}: {
  payload: DisplayPayload;
  notice?: string | null;
}) {
  const message = payload.mode === "custom_message" && typeof payload.data.message === "string"
    ? payload.data.message
    : null;
  const departures = !notice && payload.mode === "film_departures"
    ? sanitizeFilmDepartures(payload.data.departures)
    : null;
  const menu = !notice && payload.mode === "film_menu" ? sanitizeFilmMenu(payload.data.menu) : null;
  const stats = !notice && (payload.mode === "film_stats" || payload.mode === "film_status");
  const studio = !notice && (
    payload.mode === "studio_upcoming"
    || payload.mode === "studio_welcome"
    || payload.mode === "studio_active"
    || payload.mode === "studio_ending_soon"
  );
  const mode = notice
    ? "idle"
    : departures
      ? "film_departures"
      : menu
        ? "film_menu"
        : stats
          ? payload.mode
          : studio
            ? payload.mode
            : message
              ? "custom_message"
              : "idle";

  let body: ReactNode;
  if (departures) body = <DeparturesBody board={departures} />;
  else if (menu) body = <MenuBody menu={menu} />;
  else if (payload.mode === "film_menu") {
    body = <IdleBody notice={notice || "The film menu will be back in a moment."} message={null} />;
  } else if (stats) body = <StatsBody data={payload.data} />;
  else if (studio) body = <StudioBody mode={payload.mode} data={payload.data} />;
  else body = <IdleBody notice={notice ?? null} message={message} />;

  const dark = payload.theme === YOURS_DARK_THEME;
  return (
    <LandscapeDark.Provider value={dark}>
      <Chrome mode={mode}>{body}</Chrome>
    </LandscapeDark.Provider>
  );
}
