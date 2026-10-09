"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { DisplayPayload } from "@/lib/display";
import { sanitizeFilmMenu, type FilmMenu, type FilmMenuNote } from "@/lib/film-menu";

function scrollSeconds(menu: FilmMenu) {
  const lines = menu.banner.length
    + menu.sections.reduce((sum, section) => sum + section.items.length + 2, 0)
    + menu.notes.length
    + 4;
  return Math.min(220, Math.max(90, Math.round(lines * 1.6)));
}

function MenuCopy({ menu, hidden = false }: { menu: FilmMenu; hidden?: boolean }) {
  return (
    <div aria-hidden={hidden || undefined} className="pb-[14vh]">
      <h1 className="text-[clamp(2.4rem,3.1vh,4.6rem)] leading-none font-bold tracking-[0.14em]">
        {menu.title || "YOUR'S FILM MENU"}
      </h1>
      {menu.subtitle ? (
        <p className="mt-[1.4vh] text-[clamp(1.15rem,1.7vh,2.2rem)] tracking-[0.18em] opacity-85">
          {menu.subtitle}
        </p>
      ) : null}
      <Rule />
      {menu.banner.map((line) => (
        <p key={line} className="text-[clamp(1.05rem,1.55vh,2rem)] leading-snug opacity-85">
          {line}
        </p>
      ))}
      <Rule />
      {menu.sections.map((section) => (
        <section key={section.title} className="mt-[3.2vh]">
          <h2 className="text-[clamp(1.7rem,2.25vh,3.2rem)] tracking-[0.12em]">
            {section.title}
          </h2>
          <Rule />
          <ul className="mt-[0.6vh]">
            {section.items.map((item, index) => (
              <li
                key={`${section.title}-${index}-${item.name}`}
                className="flex items-baseline justify-between gap-[3vw] py-[0.15vh] text-[clamp(1.2rem,1.72vh,2.35rem)] leading-[1.38]"
              >
                <span className="min-w-0 truncate">{item.name}</span>
                <span className="shrink-0 tabular-nums">{item.price}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {menu.notes.length > 0 ? (
        <div className="mt-[4vh]">
          <Rule />
          {menu.notes.map((note, index) => (
            <NoteLine key={`${index}-${note.text}`} note={note} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Rule() {
  return <div className="my-[1vh] h-px w-full bg-[#7CFF6B]/45" />;
}

function NoteLine({ note }: { note: FilmMenuNote }) {
  if (note.heading) {
    return (
      <h2 className="mt-[3vh] text-[clamp(1.7rem,2.25vh,3.2rem)] tracking-[0.12em]">
        {note.text}
      </h2>
    );
  }
  return (
    <p className="mt-[1.2vh] text-[clamp(1.15rem,1.65vh,2.15rem)] leading-snug opacity-85">
      {note.text}
    </p>
  );
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

function nameSize(name: string, withNotes: boolean) {
  if (withNotes) {
    if (name.length <= 6) return "clamp(3.2rem, 6.2vh, 7vh)";
    if (name.length <= 10) return "clamp(2.4rem, 4.4vh, 5vh)";
    return "clamp(1.8rem, 3.2vh, 3.6vh)";
  }
  if (name.length <= 6) return "clamp(4rem, 9vh, 10vh)";
  if (name.length <= 10) return "clamp(3rem, 6.5vh, 7vh)";
  return "clamp(2.2rem, 4.4vh, 5vh)";
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

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  const clock = now ? studioClock(now) : null;
  return (
    <footer className="shrink-0 pb-[1vh] text-center tracking-[0.14em]">
      <p className="text-[clamp(1.6rem,3.2vh,3.6rem)] leading-none tabular-nums">{clock?.time ?? "\u00a0"}</p>
      <p className="mt-[0.8vh] text-[clamp(0.95rem,1.6vh,1.6rem)] opacity-80">{clock?.day ?? "\u00a0"}</p>
    </footer>
  );
}

function StudioCopy({ mode, data }: { mode: string; data: Record<string, unknown> }) {
  const firstName = textOf(data, "firstName");
  const sessionType = textOf(data, "sessionType");
  const start = textOf(data, "start");
  const end = textOf(data, "end");
  const welcome = mode === "studio_welcome";
  const upcoming = mode === "studio_upcoming";
  const ending = mode === "studio_ending_soon";
  const info = welcome || mode === "studio_active" ? linesOf(data, "infoLines") : [];
  const checkout = ending ? linesOf(data, "checkoutLines") : [];
  const withNotes = info.length > 0 || checkout.length > 0;
  const kicker = upcoming ? "Up next" : welcome ? "Welcome" : ending ? "Ending soon" : "In session";
  const time = upcoming || welcome ? start : end ? `Until ${end}` : "";
  const noteSize = withNotes ? "clamp(1.25rem, 2.15vh, 2.5rem)" : "clamp(1.5rem, 2.6vh, 3rem)";

  return (
    <div className="flex w-full flex-col items-center text-center">
      <p className="tracking-[0.34em] opacity-80 text-[clamp(1.1rem,2vh,2rem)]">{kicker}</p>
      <h1
        className="mt-[2vh] max-w-full leading-none font-bold tracking-[0.08em] break-words"
        style={{ fontSize: nameSize(firstName || "Guest", withNotes) }}
      >
        {firstName}
      </h1>
      {sessionType ? (
        <p className="mt-[2vh] max-w-[20ch] tracking-[0.12em] opacity-90 text-[clamp(1.3rem,2.4vh,2.6rem)]">
          {sessionType}
        </p>
      ) : null}
      {time ? (
        <p className="mt-[1.6vh] leading-none font-bold tracking-[0.12em] tabular-nums text-[clamp(2rem,4.2vh,4.8rem)]">
          {time}
        </p>
      ) : null}
      {info.length > 0 ? (
        <section aria-label="Studio info" data-studio-info className="mt-[4vh] w-full text-left">
          <h2 className="text-center tracking-[0.28em] text-[clamp(1.05rem,1.8vh,1.8rem)]">Studio info</h2>
          <Rule />
          <ul className="space-y-[1.8vh]">
            {info.map((line, index) => (
              <li key={`${index}-${line}`} className="leading-[1.28] tracking-[0.04em]" style={{ fontSize: noteSize }}>
                {line}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {checkout.length > 0 ? (
        <section aria-label="Checkout" data-studio-checkout className="mt-[4.5vh] w-full text-left">
          <h2 className="text-center tracking-[0.28em] text-[clamp(1.05rem,1.8vh,1.8rem)]">Before you go</h2>
          <Rule />
          <ul className="space-y-[2.2vh]">
            {checkout.map((line, index) => (
              <li key={`${index}-${line}`} className="leading-[1.25] tracking-[0.05em]" style={{ fontSize: "clamp(1.55rem, 2.8vh, 3.2rem)" }}>
                {line}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function StaticCopy({
  payload,
  notice,
}: {
  payload: DisplayPayload;
  notice?: string | null;
}) {
  const message = payload.mode === "custom_message" && typeof payload.data.message === "string"
    ? payload.data.message
    : null;
  const studio = payload.mode === "studio_upcoming"
    || payload.mode === "studio_welcome"
    || payload.mode === "studio_active"
    || payload.mode === "studio_ending_soon";

  return (
    <div className="flex h-full flex-col px-[6vw] py-[3vh]">
      <div className={`flex min-h-0 flex-1 flex-col items-center overflow-hidden ${
        studio && (payload.data.infoLines || payload.data.checkoutLines) ? "justify-start pt-[2vh]" : "justify-center"
      }`}>
        {notice ? (
          <p className="text-center text-[clamp(1.6rem,2.6vh,3rem)] leading-snug tracking-[0.08em]">{notice}</p>
        ) : message ? (
          <p className="max-w-full text-center leading-[1.15] font-bold tracking-[0.08em] whitespace-pre-wrap break-words text-[clamp(2rem,4.5vh,5rem)]">
            {message}
          </p>
        ) : studio ? (
          <StudioCopy mode={payload.mode} data={payload.data} />
        ) : (
          <div className="text-center">
            <p className="tracking-[0.42em] text-[clamp(1.2rem,2.2vh,2.2rem)]">Your&apos;s</p>
            <p className="mt-[1vh] tracking-[0.34em] opacity-80 text-[clamp(1rem,1.8vh,1.8rem)]">Durham</p>
            <Rule />
            <p className="tracking-[0.28em] opacity-80 text-[clamp(1.1rem,2vh,2rem)]">The studio</p>
            <h1 className="mt-[2vh] leading-none font-bold tracking-[0.14em] text-[clamp(4rem,9vh,8rem)]">Welcome</h1>
            <p className="mt-[3vh] tracking-[0.12em] opacity-85 text-[clamp(1.3rem,2.4vh,2.6rem)]">Make yourself at home.</p>
            <p className="mt-[4vh] tracking-[0.22em] text-[clamp(1rem,1.8vh,1.8rem)]">35mm · 120 · 110</p>
          </div>
        )}
      </div>
      <Clock />
    </div>
  );
}

export default function CrtGreenScreen({
  payload,
  notice,
}: {
  payload: DisplayPayload;
  notice?: string | null;
}) {
  const menu = payload.mode === "film_menu" ? sanitizeFilmMenu(payload.data.menu) : null;
  const seconds = menu ? scrollSeconds(menu) : 140;
  const mode = notice ? "idle" : payload.mode;

  return (
    <div
      data-display-mode={mode}
      data-display-theme="crt-green"
      className="relative flex h-dvh w-full items-stretch overflow-hidden bg-[#050505] text-[#7CFF6B] uppercase select-none"
      style={{
        fontFamily: '"Courier New", Courier, monospace',
        backgroundImage: "radial-gradient(circle at center, #1c1c1c 0%, #0a0a0a 62%, #050505 100%)",
      }}
    >
      <div className="crt-frame relative m-[2.2vh] flex flex-1 flex-col overflow-hidden rounded-[1.6vh] bg-[#020602] shadow-[inset_0_0_80px_rgba(0,0,0,0.92),inset_0_0_28px_rgba(124,255,107,0.08)]">
        {menu ? (
          <div
            className="crt-scroll absolute inset-x-[5vw] top-[3.2vh]"
            style={{ "--crt-duration": `${seconds}s` } as CSSProperties}
          >
            <MenuCopy menu={menu} />
            <MenuCopy menu={menu} hidden />
          </div>
        ) : payload.mode === "film_menu" ? (
          <div className="flex h-full items-center justify-center px-[8vw] text-center">
            <p className="text-[clamp(1.6rem,2.4vh,3rem)] leading-snug tracking-[0.08em]">
              {notice || "The film menu will be back in a moment."}
            </p>
          </div>
        ) : (
          <StaticCopy payload={payload} notice={notice} />
        )}
      </div>
    </div>
  );
}
