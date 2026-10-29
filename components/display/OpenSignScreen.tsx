"use client";

import { RETAIL_HOUR_LINES, RETAIL_HOURS_LABEL } from "@/lib/shop-hours";

/** Neon OPEN sign for the front window. Other screens never mount this. */
export default function OpenSignScreen() {
  return (
    <div
      data-display-mode="open_sign"
      data-open-sign="open"
      data-retail-hours={RETAIL_HOURS_LABEL}
      className="flex h-full w-full flex-col overflow-hidden bg-black font-jetbrains text-[#F4F1EA] select-none"
    >
      <div className="flex min-h-0 flex-1 items-center justify-center px-[4vw] py-[3vh]">
        <div className="open-sign-tube flex h-full w-full items-center justify-center px-[3vw]">
          <p
            data-open-sign-word="OPEN"
            className="open-sign-word text-center text-[clamp(8rem,28vh,22rem)] leading-[0.82] font-extrabold tracking-[0.06em]"
          >
            OPEN
          </p>
        </div>
      </div>
      <div className="shrink-0 px-[4vw] pb-[3.2vh] text-center">
        <p className="text-[clamp(0.9rem,2.2vh,1.5rem)] font-bold tracking-[0.14em] uppercase text-[#A1CC93]">
          Retail hours
        </p>
        {RETAIL_HOUR_LINES.map((line) => (
          <p key={line} className="mt-[0.6vh] text-[clamp(1.8rem,5.2vh,4rem)] font-extrabold leading-tight">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
