import type { ReactNode } from "react";
import { FILM_METRICS_CONFIG, labRunScheduleLabel } from "@/lib/film-metrics-config";
import { formatMiles } from "@/lib/miles-saved";

const PINK = "#DDB1B1";
const LILAC = "#C5AED7";
const GREEN = "#A1CC93";
const YELLOW = "#E4D48A";

export type StudioClock = { time: string; day: string };

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

function labRunLabel(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "—";
}

function milesLabel(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return formatMiles(value);
  return "—";
}

function WindowCard({
  title,
  stat,
  grow,
  children,
}: {
  title: string;
  stat: string;
  grow: number;
  children: ReactNode;
}) {
  return (
    <section
      data-stat={stat}
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[1.7rem] border-neutral-900 bg-white"
      style={{ flex: `${grow} 1 0%`, borderWidth: "1.5px" }}
    >
      <div className="relative flex shrink-0 items-center justify-center bg-[#DDB1B1] px-16 py-[0.85vh]">
        <span className="absolute left-5 flex items-center gap-2" aria-hidden="true">
          <span className="size-[clamp(0.7rem,1.05vh,1.15rem)] rounded-full bg-[#C9B7C6]" />
          <span className="size-[clamp(0.7rem,1.05vh,1.15rem)] rounded-full bg-[#E4D48A]" />
          <span className="size-[clamp(0.7rem,1.05vh,1.15rem)] rounded-full bg-[#A9C99A]" />
        </span>
        <h2 className="text-center font-jetbrains text-[clamp(1.15rem,1.85vh,2.15rem)] leading-none font-bold tracking-wide text-neutral-900">
          {title}
        </h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center bg-white px-[2.2cqw] py-[0.9vh]">
        {children}
      </div>
    </section>
  );
}

function Figure({
  value,
  featured = false,
}: {
  value: string;
  featured?: boolean;
}) {
  return (
    <p
      className={`font-jetbrains leading-none font-bold tracking-tight text-neutral-900 tabular-nums ${
        featured
          ? "text-[clamp(5rem,min(8.6vh,24cqw),13rem)]"
          : "text-[clamp(3.4rem,min(6vh,16cqw),9.5rem)]"
      }`}
    >
      {value}
    </p>
  );
}

function Wash({
  color,
  children,
  className = "",
}: {
  color: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-0 min-w-0 flex-col items-center justify-center rounded-[1.15rem] px-[1.2cqw] py-[1vh] ${className}`}
      style={{ backgroundColor: color }}
    >
      {children}
    </div>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return (
    <p className="mt-[0.9vh] text-center font-jetbrains text-[clamp(1rem,1.5vh,1.7rem)] leading-tight font-medium text-neutral-900">
      {children}
    </p>
  );
}

export default function FilmStatsBoard({
  data,
  clock,
}: {
  data: Record<string, unknown>;
  clock: StudioClock | null;
}) {
  const windowDays = FILM_METRICS_CONFIG.turnaroundWindowDays;
  const schedule = labRunScheduleLabel();

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-[0.7vh]">
      <WindowCard title="Rolls in process" stat="rolls-processing" grow={1.32}>
        <Wash color={LILAC} className="flex-1">
          <Figure value={countLabel(data.rollsProcessing)} featured />
          <Caption>Scan rolls in house or at the lab</Caption>
        </Wash>
      </WindowCard>

      <WindowCard title="Received" stat="received" grow={1.12}>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-[1.6cqw]">
          <Wash color={PINK} className="h-full">
            <Figure value={countLabel(data.receivedToday)} />
            <Caption>Today</Caption>
          </Wash>
          <Wash color={PINK} className="h-full">
            <Figure value={countLabel(data.receivedThisWeek)} />
            <Caption>This week</Caption>
          </Wash>
        </div>
      </WindowCard>

      <WindowCard title="Scans sent" stat="scans-sent" grow={1.12}>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-[1.6cqw]">
          <Wash color={GREEN} className="h-full">
            <Figure value={countLabel(data.scansSentToday)} />
            <Caption>Today</Caption>
          </Wash>
          <Wash color={GREEN} className="h-full">
            <Figure value={countLabel(data.scansSentThisWeek)} />
            <Caption>This week</Caption>
          </Wash>
        </div>
      </WindowCard>

      <WindowCard title="Turnaround" stat="turnaround" grow={1.22}>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-[1.6cqw]">
          <Wash color={LILAC} className="h-full">
            <Figure value={daysLabel(data.averageColorTurnaroundDays)} />
            <Caption>Color · days</Caption>
          </Wash>
          <Wash color={LILAC} className="h-full">
            <Figure value={daysLabel(data.averageBwTurnaroundDays)} />
            <Caption>Black & white · days</Caption>
          </Wash>
        </div>
        <p className="mt-[1vh] shrink-0 text-center font-jetbrains text-[clamp(0.9rem,1.3vh,1.45rem)] leading-tight font-medium text-neutral-900">
          Received at lab to scans sent · last {windowDays} days
        </p>
      </WindowCard>

      <WindowCard title="Next lab run" stat="next-lab-run" grow={0.98}>
        <Wash color={LILAC} className="flex-1">
          <p className="text-center font-jetbrains text-[clamp(2rem,min(3.5vh,7.4cqw),4.5rem)] leading-none font-bold tracking-tight text-neutral-900">
            {labRunLabel(data.nextLabRun)}
          </p>
          {schedule ? <Caption>{schedule}</Caption> : null}
        </Wash>
      </WindowCard>

      <WindowCard title="Miles saved" stat="miles-saved" grow={1.02}>
        <Wash color={YELLOW} className="flex-1">
          <Figure value={milesLabel(data.milesSaved)} />
          <Caption>miles of driving saved, all time</Caption>
        </Wash>
      </WindowCard>

      <WindowCard title="Clock" stat="clock" grow={0.9}>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
          <p className="min-h-[1em] font-jetbrains text-[clamp(3.5rem,min(6.4vh,14cqw),8rem)] leading-none font-bold tracking-tight text-neutral-900 tabular-nums">
            {clock?.time ?? "\u00a0"}
          </p>
          <p className="mt-[1vh] min-h-[1.2em] text-center font-jetbrains text-[clamp(1.05rem,1.6vh,1.8rem)] leading-tight font-medium text-neutral-900">
            {clock?.day ?? "\u00a0"}
          </p>
        </div>
      </WindowCard>
    </div>
  );
}
