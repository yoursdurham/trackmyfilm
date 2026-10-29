"use client";

import { useEffect, useState } from "react";
import { FILM_METRICS_CONFIG } from "@/lib/film-metrics-config";
import { halloweenCountdown, halloweenRollCount, type HalloweenCountdown } from "@/lib/halloween-display";
import type { DisplayOrientation } from "@/lib/display";

const ORANGE = "#FF6A00";
const PINK = "#DDB1B1";
const GREEN = "#A1CC93";
const INK = "#F4F1EA";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function useCountdown() {
  const [count, setCount] = useState<HalloweenCountdown>(() => halloweenCountdown(new Date()));
  useEffect(() => {
    const tick = () => setCount(halloweenCountdown(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return count;
}

function Bat({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 64 28" aria-hidden className={className} fill={INK}>
      <polygon points="32,14 10,2 16,14 2,10 18,18 32,15 46,18 62,10 48,14 54,2" />
    </svg>
  );
}

function Pumpkin({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 80 88" aria-hidden className={className}>
      <rect x="36" y="4" width="8" height="16" rx="2" fill={GREEN} />
      <circle cx="40" cy="50" r="30" fill={ORANGE} />
      <polygon points="26,46 34,46 30,56" fill="#0a0a0a" />
      <polygon points="46,46 54,46 50,56" fill="#0a0a0a" />
      <path d="M28 64 Q40 74 52 64" fill="none" stroke="#0a0a0a" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function SprocketRail({ along }: { along: "vertical" | "horizontal" }) {
  const count = along === "vertical" ? 16 : 14;
  return (
    <div
      aria-hidden
      data-halloween-sprockets={along}
      className={along === "vertical"
        ? "flex h-full w-[5.2vh] max-w-[72px] shrink-0 flex-col items-center justify-around bg-[#FF6A00] py-[1vh]"
        : "flex h-[5.6vh] max-h-[72px] w-full shrink-0 items-center justify-around bg-[#FF6A00] px-[1vw]"}
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className={along === "vertical"
            ? "block h-[2.4vh] w-[58%] rounded-[3px] bg-black"
            : "block h-[52%] w-[2.2vw] max-w-[36px] rounded-[3px] bg-black"}
        />
      ))}
    </div>
  );
}

function CountUnit({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[clamp(2.4rem,8vh,7rem)] leading-none font-extrabold tabular-nums" style={{ color: ORANGE }}>
        {value}
      </p>
      <p className="mt-[0.6vh] text-[clamp(0.8rem,1.8vh,1.4rem)] font-bold tracking-[0.18em] uppercase" style={{ color: PINK }}>
        {label}
      </p>
    </div>
  );
}

function Countdown({ count, wide }: { count: HalloweenCountdown; wide: boolean }) {
  if (count.phase === "today") {
    return (
      <p data-halloween-phase="today" className="text-[clamp(2rem,6vh,5.5rem)] leading-none font-extrabold tracking-[0.08em] uppercase" style={{ color: ORANGE }}>
        Happy Halloween
      </p>
    );
  }

  return (
    <div
      data-halloween-phase="countdown"
      className={wide ? "grid grid-cols-4 gap-[3vw]" : "grid grid-cols-2 gap-x-[8vw] gap-y-[3vh]"}
    >
      <CountUnit value={pad(count.days)} label="Days" />
      <CountUnit value={pad(count.hours)} label="Hours" />
      <CountUnit value={pad(count.minutes)} label="Minutes" />
      <CountUnit value={pad(count.seconds)} label="Seconds" />
    </div>
  );
}

export default function HalloweenScreen({
  orientation,
  rolls,
}: {
  orientation: DisplayOrientation;
  rolls?: number | null;
}) {
  const wide = orientation === "landscape";
  const count = useCountdown();
  const shownRolls = halloweenRollCount(rolls);
  const windowDays = FILM_METRICS_CONFIG.turnaroundWindowDays;

  return (
    <div
      data-display-mode="halloween"
      data-halloween-orientation={orientation}
      className={`relative h-full w-full overflow-hidden bg-black font-jetbrains text-[#F4F1EA] select-none ${wide ? "flex flex-col" : "flex"}`}
    >
      <SprocketRail along={wide ? "horizontal" : "vertical"} />
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center px-[4vw] py-[2vh] text-center">
        <p className="text-[clamp(0.9rem,2vh,1.6rem)] font-bold tracking-[0.42em] uppercase" style={{ color: PINK }}>
          Yours Durham
        </p>
        <h1 className={`mt-[1.2vh] leading-[0.9] font-extrabold tracking-[0.02em] uppercase ${
          wide ? "text-[clamp(4.2rem,11vh,10rem)]" : "text-[clamp(3.2rem,10cqw,7rem)]"
        }`}>
          <span className="block">Happy</span>
          <span className="block" style={{ color: ORANGE }}>Halloween</span>
        </h1>
        <p className="mt-[1.6vh] text-[clamp(1rem,2.2vh,1.8rem)] font-bold tracking-[0.16em] uppercase" style={{ color: GREEN }}>
          {count.phase === "today" ? "Tonight" : "Until October 31"}
        </p>
        <div className="mt-[2.4vh]">
          <Countdown count={count} wide={wide} />
        </div>
        {shownRolls !== null ? (
          <p data-halloween-rolls className="mt-[3vh] text-[clamp(1.1rem,2.4vh,2rem)] font-bold tracking-[0.08em] uppercase">
            <span className="text-[clamp(2rem,5vh,4.2rem)] font-extrabold tabular-nums" style={{ color: GREEN }}>{shownRolls}</span>
            {` rolls scanned · last ${windowDays} days`}
          </p>
        ) : null}
        <Bat className={`halloween-drift absolute ${wide ? "top-[8%] left-[8%] w-[9vw]" : "top-[6%] left-[8%] w-[18cqw]"}`} />
        <Bat className={`halloween-drift absolute ${wide ? "top-[18%] right-[10%] w-[7vw]" : "top-[14%] right-[6%] w-[14cqw]"}`} />
        <Pumpkin className={`absolute ${wide ? "right-[6vw] bottom-[4vh] w-[8vw]" : "right-[4cqw] bottom-[3vh] w-[16cqw]"}`} />
        <div aria-hidden className="halloween-flicker pointer-events-none absolute inset-0" />
      </div>
      <SprocketRail along={wide ? "horizontal" : "vertical"} />
    </div>
  );
}
