import {
  formatMiles,
  lapRings,
  lapsCaption,
  type PublicMilesSaved,
} from "@/lib/miles-saved";
import { getCachedPublicMilesSaved } from "@/lib/miles-saved-data";

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

function MilesSavedGlobe({ laps }: { laps: number }) {
  const ringCount = Math.max(1, lapRings(laps).slice(-4).length);
  const outer = FIRST_RING_R + (ringCount - 1) * RING_STEP + RING_STROKE / 2 + 6;
  const size = outer * 2;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto mt-6 mb-7 w-[min(100%,17.5rem)]"
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
    <section aria-labelledby="miles-saved-heading" className="mx-auto mb-14 w-full max-w-[440px]">
      <div className="overflow-hidden rounded-[1.7rem] border-2 border-neutral-900 bg-white">
        <div className="relative flex items-center justify-center bg-[#E4C6C6] px-12 py-2.5">
          <span className="absolute left-3.5 flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-[#C9B7C6]" />
            <span className="size-2.5 rounded-full bg-[#E4D48A]" />
            <span className="size-2.5 rounded-full bg-[#A9C99A]" />
          </span>
          <p className="text-[0.82rem] font-semibold tracking-wide text-neutral-900">
            Yours, Durham · {year}
          </p>
        </div>

        <div className="px-5 pb-7 pt-7 text-center sm:px-8 sm:pt-8">
          <h2
            id="miles-saved-heading"
            className="text-[1.55rem] font-bold tracking-tight text-slate-900 sm:text-[1.8rem]"
          >
            Our customers saved
          </h2>
          <p className="mt-2 text-[3.6rem] font-black leading-none tracking-[-0.045em] text-neutral-950 tabular-nums sm:text-[4.75rem]">
            {formatMiles(miles)}
          </p>
          <p className="mt-2 text-[1.05rem] font-bold text-slate-900 sm:text-[1.25rem]">
            miles of driving to Raleigh
          </p>
          <p className="mt-1 text-[0.95rem] text-slate-500">{lapsCaption(laps)}</p>

          <MilesSavedGlobe laps={laps} />

          <p className="text-[1.28rem] font-bold tracking-tight text-slate-900 sm:text-[1.45rem]">
            Drop off in Durham.
          </p>
          <p className="mt-1 text-[1.05rem] font-bold text-slate-900 sm:text-[1.2rem]">
            We drive it to the lab for you.
          </p>
          <p className="mx-auto mt-5 max-w-[36ch] text-[0.8rem] leading-relaxed text-slate-500 sm:text-[0.84rem]">
            Each drop-off saves a customer a ~32 mi round trip, minus our own twice-a-week lab runs.
          </p>
        </div>
      </div>
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
