import type { CSSProperties } from "react";
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

export default function CrtGreenScreen({
  payload,
  notice,
}: {
  payload: DisplayPayload;
  notice?: string | null;
}) {
  const menu = sanitizeFilmMenu(payload.data.menu);
  const seconds = menu ? scrollSeconds(menu) : 140;

  return (
    <div
      data-display-mode={payload.mode === "film_menu" ? "film_menu" : payload.mode}
      data-display-theme="crt-green"
      className="relative flex h-dvh w-full items-stretch overflow-hidden bg-[#050505] font-mono text-[#7CFF6B] uppercase select-none"
      style={{
        backgroundImage: "radial-gradient(circle at center, #1c1c1c 0%, #0a0a0a 62%, #050505 100%)",
      }}
    >
      <div className="crt-frame relative m-[2.2vh] flex-1 overflow-hidden rounded-[1.6vh] bg-[#020602] shadow-[inset_0_0_80px_rgba(0,0,0,0.92),inset_0_0_28px_rgba(124,255,107,0.08)]">
        {notice || !menu ? (
          <div className="flex h-full items-center justify-center px-[8vw] text-center">
            <p className="text-[clamp(1.6rem,2.4vh,3rem)] leading-snug tracking-[0.08em]">
              {notice || "The film menu will be back in a moment."}
            </p>
          </div>
        ) : (
          <div
            className="crt-scroll absolute inset-x-[5vw] top-[3.2vh]"
            style={{ "--crt-duration": `${seconds}s` } as CSSProperties}
          >
            <MenuCopy menu={menu} />
            <MenuCopy menu={menu} hidden />
          </div>
        )}
      </div>
    </div>
  );
}
