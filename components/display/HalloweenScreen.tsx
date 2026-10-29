"use client";

import { useEffect, useState } from "react";
import { FILM_METRICS_CONFIG } from "@/lib/film-metrics-config";
import { halloweenCountdown, halloweenRollCount, type HalloweenCountdown } from "@/lib/halloween-display";
import type { DisplayOrientation } from "@/lib/display";

const ORANGE = "#FF6A00";
const PINK = "#DDB1B1";
const GREEN = "#A1CC93";

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

function CountUnit({ value, label, wide }: { value: string; label: string; wide: boolean }) {
  return (
    <div className="min-w-0">
      <p className={`leading-none font-extrabold tabular-nums ${
        wide ? "text-[clamp(3.4rem,12vh,9rem)]" : "text-[clamp(3.8rem,16cqw,8rem)]"
      }`} style={{ color: ORANGE }}>
        {value}
      </p>
      <p className={`mt-[0.8vh] font-bold tracking-[0.2em] uppercase ${
        wide ? "text-[clamp(0.95rem,2.2vh,1.7rem)]" : "text-[clamp(0.9rem,2.4cqw,1.5rem)]"
      }`} style={{ color: PINK }}>
        {label}
      </p>
    </div>
  );
}

function ColorRule() {
  return (
    <div aria-hidden data-halloween-rule className="flex w-full items-center gap-[1.6vw]">
      <span className="h-[0.7vh] min-h-[4px] flex-1 bg-[#DDB1B1]" />
      <span className="h-[1.6vh] w-[1.6vh] min-h-[10px] min-w-[10px] bg-[#FF6A00]" />
      <span className="h-[0.7vh] min-h-[4px] flex-1 bg-[#A1CC93]" />
    </div>
  );
}

function Countdown({ count, wide }: { count: HalloweenCountdown; wide: boolean }) {
  if (count.phase === "today") {
    return (
      <p data-halloween-phase="today" className={`leading-none font-extrabold tracking-[0.08em] uppercase ${
        wide ? "text-[clamp(3rem,8vh,7rem)]" : "text-[clamp(2.4rem,8cqw,5.5rem)]"
      }`} style={{ color: ORANGE }}>
        Happy Halloween
      </p>
    );
  }

  return (
    <div
      data-halloween-phase="countdown"
      className={wide ? "grid w-full max-w-[78rem] grid-cols-4 gap-[2vw]" : "flex h-full w-full flex-col justify-evenly"}
    >
      <CountUnit wide={wide} value={pad(count.days)} label="Days" />
      <CountUnit wide={wide} value={pad(count.hours)} label="Hours" />
      <CountUnit wide={wide} value={pad(count.minutes)} label="Minutes" />
      <CountUnit wide={wide} value={pad(count.seconds)} label="Seconds" />
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
      <div className={`relative flex min-h-0 min-w-0 flex-1 flex-col items-center text-center ${
        wide ? "justify-between px-[5vw] py-[2.4vh]" : "justify-between px-[4cqw] py-[5vh]"
      }`}>
        <p className={`font-bold tracking-[0.42em] uppercase ${
          wide ? "text-[clamp(1.1rem,2.6vh,2rem)]" : "text-[clamp(1rem,3.2cqw,1.8rem)]"
        }`} style={{ color: PINK }}>
          Yours Durham
        </p>
        <div className={`flex w-full flex-col items-center ${wide ? "" : "min-h-0 flex-1"}`}>
          <h1 className={`leading-[0.86] font-extrabold tracking-[0.02em] uppercase ${
            wide ? "text-[clamp(5.4rem,15vh,13rem)]" : "text-[clamp(3.6rem,13cqw,8.5rem)]"
          }`}>
            <span className="block">Happy</span>
            <span className="block" style={{ color: ORANGE }}>Halloween</span>
          </h1>
          <div className={wide ? "mt-[2vh] w-full" : "mt-[3vh] w-full"}>
            <ColorRule />
          </div>
          <p className={`font-bold tracking-[0.18em] uppercase ${
            wide ? "mt-[1.8vh] text-[clamp(1.15rem,2.6vh,2.1rem)]" : "mt-[2.4vh] text-[clamp(1rem,3cqw,1.7rem)]"
          }`} style={{ color: GREEN }}>
            {count.phase === "today" ? "Tonight" : "Until October 31"}
          </p>
          <div className={wide ? "mt-[1.6vh] w-full" : "mt-[3vh] flex min-h-0 w-full flex-1 items-center"}>
            <Countdown count={count} wide={wide} />
          </div>
        </div>
        <div className="flex w-full flex-col items-center gap-[2vh]">
          <ColorRule />
          {shownRolls !== null ? (
            <p data-halloween-rolls className={`font-bold tracking-[0.08em] uppercase ${
              wide ? "text-[clamp(1.25rem,2.8vh,2.3rem)]" : "text-[clamp(1.1rem,3.2cqw,1.8rem)]"
            }`}>
              <span className={`font-extrabold tabular-nums ${
                wide ? "text-[clamp(2.6rem,6.5vh,5.5rem)]" : "text-[clamp(2.2rem,8cqw,4.5rem)]"
              }`} style={{ color: GREEN }}>{shownRolls}</span>
              {` rolls scanned · last ${windowDays} days`}
            </p>
          ) : (
            <p className="text-[clamp(1rem,2.2vh,1.6rem)] font-bold tracking-[0.22em] uppercase" style={{ color: PINK }}>
              35mm · 120 · 110
            </p>
          )}
        </div>
        <div aria-hidden className="halloween-flicker pointer-events-none absolute inset-0" />
      </div>
      <SprocketRail along={wide ? "horizontal" : "vertical"} />
    </div>
  );
}
