"use client";

import type { DisplayOrientation } from "@/lib/display";
import { RETAIL_HOUR_LINES, RETAIL_HOURS_LABEL } from "@/lib/shop-hours";

export default function OpenSignScreen({
  orientation,
}: {
  orientation: DisplayOrientation;
}) {
  const wide = orientation === "landscape";

  return (
    <div
      data-display-mode="open_sign"
      data-open-sign="open"
      data-open-sign-orientation={orientation}
      data-retail-hours={RETAIL_HOURS_LABEL}
      className="flex h-full w-full flex-col overflow-hidden bg-black font-jetbrains text-[#F4F1EA] select-none"
    >
      <div className={`flex min-h-0 flex-1 items-center justify-center ${wide ? "px-[4vw] py-[3vh]" : "px-[4cqw] py-[4vh]"}`}>
        <div className={`open-sign-tube flex h-full w-full items-center justify-center ${wide ? "px-[3vw]" : "px-[3cqw]"}`}>
          <p
            data-open-sign-word="OPEN"
            className={`open-sign-word text-center leading-[0.82] font-extrabold tracking-[0.06em] ${
              wide ? "text-[clamp(8rem,28vh,22rem)]" : "text-[clamp(4.5rem,20cqw,12rem)]"
            }`}
          >
            OPEN
          </p>
        </div>
      </div>
      <div className={`shrink-0 text-center ${wide ? "px-[4vw] pb-[3.2vh]" : "px-[4cqw] pb-[4vh]"}`}>
        <p className={`font-bold tracking-[0.14em] uppercase text-[#A1CC93] ${
          wide ? "text-[clamp(0.9rem,2.2vh,1.5rem)]" : "text-[clamp(0.8rem,2.6cqw,1.2rem)]"
        }`}>
          Retail hours
        </p>
        {RETAIL_HOUR_LINES.map((line) => (
          <p
            key={line}
            className={`mt-[0.6vh] font-extrabold leading-tight ${
              wide ? "text-[clamp(1.8rem,5.2vh,4rem)]" : "text-[clamp(1.4rem,5.5cqw,2.6rem)]"
            }`}
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
