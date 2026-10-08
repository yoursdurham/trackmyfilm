import { FILM_METRICS_CONFIG, labRunScheduleLabel } from "@/lib/film-metrics-config";

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

function Kicker({ children }: { children: string }) {
  return (
    <p className="text-[clamp(1rem,1.7vh,2rem)] font-medium tracking-[0.34em] text-[var(--accent-purple)] uppercase">
      {children}
    </p>
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
      className={`leading-none font-semibold tracking-tight tabular-nums ${
        featured
          ? "text-[clamp(5.5rem,11vh,16rem)]"
          : "text-[clamp(4rem,7.4vh,11rem)]"
      }`}
    >
      {value}
    </p>
  );
}

export default function FilmStatsBoard({ data }: { data: Record<string, unknown> }) {
  const windowDays = FILM_METRICS_CONFIG.turnaroundWindowDays;
  const schedule = labRunScheduleLabel();

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col justify-between py-[0.6vh]">
      <section data-stat="rolls-processing" className="border-t border-[var(--accent-purple)]/40 pt-[1.6vh]">
        <Kicker>Rolls in process</Kicker>
        <Figure value={countLabel(data.rollsProcessing)} featured />
        <p className="mt-[0.8vh] text-[clamp(0.95rem,1.45vh,1.7rem)] text-[var(--text-muted)]">
          Scan rolls in house or at the lab
        </p>
      </section>

      <section data-stat="received" className="border-t border-[var(--accent-purple)]/40 pt-[1.6vh]">
        <Kicker>Received</Kicker>
        <div className="mt-[0.8vh] grid grid-cols-2 gap-[4vw]">
          <div>
            <Figure value={countLabel(data.receivedToday)} />
            <p className="mt-[0.7vh] text-[clamp(0.95rem,1.45vh,1.7rem)] text-[var(--text-muted)]">Today</p>
          </div>
          <div>
            <Figure value={countLabel(data.receivedThisWeek)} />
            <p className="mt-[0.7vh] text-[clamp(0.95rem,1.45vh,1.7rem)] text-[var(--text-muted)]">This week</p>
          </div>
        </div>
      </section>

      <section data-stat="scans-sent" className="border-t border-[var(--accent-purple)]/40 pt-[1.6vh]">
        <Kicker>Scans sent</Kicker>
        <div className="mt-[0.8vh] grid grid-cols-2 gap-[4vw]">
          <div>
            <Figure value={countLabel(data.scansSentToday)} />
            <p className="mt-[0.7vh] text-[clamp(0.95rem,1.45vh,1.7rem)] text-[var(--text-muted)]">Today</p>
          </div>
          <div>
            <Figure value={countLabel(data.scansSentThisWeek)} />
            <p className="mt-[0.7vh] text-[clamp(0.95rem,1.45vh,1.7rem)] text-[var(--text-muted)]">This week</p>
          </div>
        </div>
      </section>

      <section data-stat="turnaround" className="border-t border-[var(--accent-purple)]/40 pt-[1.6vh]">
        <Kicker>Turnaround</Kicker>
        <div className="mt-[0.8vh] grid grid-cols-2 gap-[4vw]">
          <div>
            <Figure value={daysLabel(data.averageColorTurnaroundDays)} />
            <p className="mt-[0.7vh] text-[clamp(0.95rem,1.45vh,1.7rem)] text-[var(--accent-green)]">
              Color · days
            </p>
          </div>
          <div>
            <Figure value={daysLabel(data.averageBwTurnaroundDays)} />
            <p className="mt-[0.7vh] text-[clamp(0.95rem,1.45vh,1.7rem)] text-[var(--text-muted)]">
              Black & white · days
            </p>
          </div>
        </div>
        <p className="mt-[1vh] text-[clamp(0.85rem,1.25vh,1.45rem)] tracking-[0.08em] text-[var(--text-muted)]">
          Received at lab to scans sent · last {windowDays} days
        </p>
      </section>

      <section data-stat="next-lab-run" className="border-t border-[var(--accent-purple)]/40 pt-[1.6vh]">
        <Kicker>Next lab run</Kicker>
        <p className="mt-[0.8vh] text-[clamp(2.6rem,4.6vh,6.5rem)] leading-none font-semibold tracking-tight">
          {labRunLabel(data.nextLabRun)}
        </p>
        {schedule ? (
          <p className="mt-[1vh] text-[clamp(0.95rem,1.45vh,1.7rem)] text-[var(--text-muted)]">
            {schedule}
          </p>
        ) : null}
      </section>
    </div>
  );
}
