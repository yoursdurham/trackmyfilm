import {
  formatMiles,
  lapRings,
  lapsCaption,
  type PublicMilesSaved,
} from "@/lib/miles-saved";
import { getCachedPublicMilesSaved } from "@/lib/miles-saved-data";
import WindowFrame from "@/components/WindowFrame";
import { cn } from "@/lib/utils";

const GLOBE = "#A1CC93";
const GRID = "#2A2A2A";
const PROGRESS = "#DDB1B1";
const TRACK = "#E8D5C8";

const GLOBE_R = 54;
const RING_STROKE = 10;
const FIRST_RING_R = GLOBE_R + 16;
const RING_STEP = 15;

function EarthGlobe({ cx, cy }: { cx: number; cy: number }) {
  const r = GLOBE_R;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={GLOBE} />
      <g clipPath="url(#miles-saved-globe-clip)" fill="none" stroke={GRID} strokeWidth="1.6">
        <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.28} />
        <ellipse cx={cx} cy={cy - r * 0.42} rx={r * 0.74} ry={r * 0.15} />
        <ellipse cx={cx} cy={cy + r * 0.42} rx={r * 0.74} ry={r * 0.15} />
        <ellipse cx={cx} cy={cy} rx={r * 0.28} ry={r} />
        <ellipse cx={cx} cy={cy} rx={r * 0.62} ry={r} />
        <path d={`M ${cx} ${cy - r} V ${cy + r}`} />
      </g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={GRID} strokeWidth="1.8" />
    </g>
  );
}

function ProgressRings({ cx, cy, laps }: { cx: number; cy: number; laps: number }) {
  const rings = lapRings(laps).slice(-4);
  return (
    <g>
      {rings.map((fraction, index) => {
        const radius = FIRST_RING_R + index * RING_STEP;
        const circumference = 2 * Math.PI * radius;
        const full = fraction >= 1;
        return (
          <g key={radius}>
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={TRACK}
              strokeWidth={RING_STROKE}
            />
            {full ? (
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={PROGRESS}
                strokeWidth={RING_STROKE}
              />
            ) : fraction > 0 ? (
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={PROGRESS}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                strokeDasharray={`${fraction * circumference} ${circumference}`}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

function MilesSavedGlobe({ laps, className }: { laps: number; className?: string }) {
  const ringCount = Math.max(1, lapRings(laps).slice(-4).length);
  const outer = FIRST_RING_R + (ringCount - 1) * RING_STEP + RING_STROKE / 2 + 6;
  const size = outer * 2;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={cn("mx-auto w-[min(100%,15rem)] lg:w-full", className)}
      aria-hidden="true"
    >
      <defs>
        <clipPath id="miles-saved-globe-clip">
          <circle cx={outer} cy={outer} r={GLOBE_R - 0.6} />
        </clipPath>
      </defs>
      <ProgressRings cx={outer} cy={outer} laps={laps} />
      <EarthGlobe cx={outer} cy={outer} />
    </svg>
  );
}

function MilesSavedCard({ miles, laps, year }: { miles: number; laps: number; year: number }) {
  return (
    <section aria-labelledby="miles-saved-heading" className="mb-14 w-full">
      <WindowFrame title={`Yours, Durham · ${year}`}>
        <div className="flex flex-col items-center px-5 py-7 text-center sm:px-8 sm:py-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] lg:items-center lg:gap-x-10 lg:px-10 lg:py-9 lg:text-left">
          <div className="order-1 w-full lg:col-start-1 lg:row-start-1">
            <h2
              id="miles-saved-heading"
              className="font-jetbrains text-[1.45rem] font-bold tracking-tight text-neutral-900 sm:text-[1.7rem]"
            >
              Our customers saved
            </h2>
            <p className="mt-2 font-jetbrains text-[3.25rem] font-extrabold leading-none tracking-[-0.04em] text-neutral-950 tabular-nums sm:text-[4.25rem]">
              {formatMiles(miles)}
            </p>
            <p className="mt-2 font-jetbrains text-[1.02rem] font-bold text-neutral-900 sm:text-[1.15rem]">
              miles of driving to Raleigh
            </p>
            <p className="mt-1 text-[0.95rem] text-slate-600">{lapsCaption(laps)}</p>
          </div>

          <MilesSavedGlobe laps={laps} className="order-2 my-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:my-0" />

          <div className="order-3 w-full lg:col-start-1 lg:row-start-2 lg:mt-6">
            <p className="font-jetbrains text-[1.2rem] font-bold tracking-tight text-neutral-900 sm:text-[1.35rem]">
              Drop off in Durham.
            </p>
            <p className="mt-1 font-jetbrains text-[1.02rem] font-bold text-neutral-900 sm:text-[1.12rem]">
              We drive it to the lab for you.
            </p>
            <p className="mx-auto mt-4 max-w-[42ch] text-[0.8rem] leading-relaxed text-slate-600 sm:text-[0.84rem] lg:mx-0">
              Each drop-off saves a customer a ~32 mi round trip, minus our own twice-a-week lab runs.
            </p>
          </div>
        </div>
      </WindowFrame>
    </section>
  );
}

export default async function MilesSavedSection() {
  let stats: PublicMilesSaved | null = null;
  try {
    stats = await getCachedPublicMilesSaved();
  } catch {
    console.error("Miles saved figure unavailable");
    return null;
  }
  return <MilesSavedCard miles={stats.miles} laps={stats.laps} year={stats.year} />;
}
