"use client";

import type { CSSProperties } from "react";
import { YOURS_BLEND_COLORS, YOURS_BLEND_GRADIENT } from "@/lib/brand-colors";
import { FILM_METRICS_CONFIG, labRunScheduleLabel } from "@/lib/film-metrics-config";
import type { OpenSignStats } from "@/lib/display";
import { RETAIL_HOUR_LINES, RETAIL_HOURS_LABEL } from "@/lib/shop-hours";

const [PINK, LILAC, GREEN] = YOURS_BLEND_COLORS;

/** Neon OPEN sign for the front window. Other screens never mount this. */
export default function OpenSignScreen({ stats }: { stats?: OpenSignStats | null }) {
  const windowDays = FILM_METRICS_CONFIG.turnaroundWindowDays;
  const schedule = labRunScheduleLabel();

  return (
    <div
      data-display-mode="open_sign"
      data-open-sign="open"
      data-retail-hours={RETAIL_HOURS_LABEL}
      className="grid h-full w-full grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-black font-jetbrains text-[#F4F1EA] select-none"
      style={{ "--yours-blend": YOURS_BLEND_GRADIENT } as CSSProperties}
    >
      <div className="grid min-h-0 grid-cols-[minmax(0,1.55fr)_minmax(0,0.78fr)] items-stretch gap-[1.6vw] px-[2.2vw] pt-[2.2vh]">
        <div className="open-sign-tube flex min-h-0 items-center justify-center px-[2vw]">
          <p
            data-open-sign-word="OPEN"
            className="open-sign-word inline-grid text-center text-[clamp(7rem,24vh,18rem)] leading-[0.82] font-extrabold tracking-[0.06em]"
          >
            <span aria-hidden="true" className="open-sign-glow col-start-1 row-start-1">OPEN</span>
            <span className="open-sign-face col-start-1 row-start-1">OPEN</span>
          </p>
        </div>
        <aside data-open-sign-hours className="flex min-w-0 flex-col justify-center">
          <p className="text-[clamp(0.9rem,2vh,1.45rem)] font-bold tracking-[0.16em] uppercase text-[#A1CC93]">
            Retail hours
          </p>
          {RETAIL_HOUR_LINES.map((line) => (
            <p key={line} className="open-sign-hours mt-[1.2vh] text-[clamp(1.7rem,4.2vh,3.3rem)] leading-[1.05] font-extrabold whitespace-nowrap">
              {line}
            </p>
          ))}
        </aside>
      </div>

      <footer data-open-sign-stats className="open-sign-stats mx-[2.2vw] mt-[1.2vh] mb-[1.6vh] grid grid-cols-5 gap-[1.1vw] pt-[1.8vh] pb-[0.6vh]">
        <Stat stat="rolls-processing" label="Rolls in process" accent={LILAC} value={countLabel(stats?.rollsProcessing)} caption="In house or at the lab" />
        <PairStat
          stat="received"
          label="Received"
          accent={PINK}
          left={{ value: countLabel(stats?.receivedThisWeek), caption: "This week" }}
          right={{ value: countLabel(stats?.receivedToday), caption: "Today" }}
        />
        <PairStat
          stat="scans-sent"
          label="Scans sent"
          accent={GREEN}
          left={{ value: countLabel(stats?.scansSentThisWeek), caption: "This week" }}
          right={{ value: countLabel(stats?.scansSentToday), caption: "Today" }}
        />
        <PairStat
          stat="turnaround"
          label="Turnaround"
          accent={LILAC}
          left={{ value: daysLabel(stats?.averageColorTurnaroundDays), caption: "Color · days" }}
          right={{ value: daysLabel(stats?.averageBwTurnaroundDays), caption: "Black & white" }}
          note={`Last ${windowDays} days`}
        />
        <Stat stat="next-lab-run" label="Next lab run" accent={GREEN} value={labRunLabel(stats?.nextLabRun)} caption={schedule || undefined} />
      </footer>
    </div>
  );
}

function Stat({
  stat,
  label,
  accent,
  value,
  caption,
}: {
  stat: string;
  label: string;
  accent: string;
  value: string;
  caption?: string;
}) {
  return (
    <div data-stat={stat} className="min-w-0">
      <Label accent={accent}>{label}</Label>
      <p className={`open-sign-stat mt-[0.6vh] leading-none font-extrabold tabular-nums ${stat === "next-lab-run" ? "text-[clamp(1.25rem,2.7vh,2.15rem)] whitespace-nowrap" : "text-[clamp(3.2rem,8vh,6.6rem)]"}`}>
        {value}
      </p>
      {caption ? <Caption>{caption}</Caption> : null}
    </div>
  );
}

function PairStat({
  stat,
  label,
  accent,
  left,
  right,
  note,
}: {
  stat: string;
  label: string;
  accent: string;
  left: { value: string; caption: string };
  right: { value: string; caption: string };
  note?: string;
}) {
  return (
    <div data-stat={stat} className="min-w-0">
      <Label accent={accent}>{label}</Label>
      <div className="mt-[0.5vh] grid grid-cols-2 gap-[0.5vw]">
        <div className="min-w-0">
          <p className="open-sign-stat text-[clamp(2.3rem,5.8vh,4.8rem)] leading-none font-extrabold tabular-nums">{left.value}</p>
          <Caption>{left.caption}</Caption>
        </div>
        <div className="min-w-0">
          <p className="open-sign-stat text-[clamp(2.3rem,5.8vh,4.8rem)] leading-none font-extrabold tabular-nums">{right.value}</p>
          <Caption>{right.caption}</Caption>
        </div>
      </div>
      {note ? <Caption>{note}</Caption> : null}
    </div>
  );
}

function Label({ accent, children }: { accent: string; children: string }) {
  return (
    <p className="text-[clamp(0.95rem,2vh,1.55rem)] font-bold tracking-[0.12em] uppercase" style={{ color: accent }}>
      {children}
    </p>
  );
}

function Caption({ children }: { children: string }) {
  return (
    <p className="mt-[0.45vh] text-[clamp(0.95rem,1.9vh,1.5rem)] leading-tight text-[#f4f1ea]">
      {children}
    </p>
  );
}

function countLabel(value: number | null | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.round(value));
  return "—";
}

function daysLabel(value: number | null | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return (Math.round(value * 10) / 10).toFixed(1);
  }
  return "—";
}

function labRunLabel(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "—";
}
