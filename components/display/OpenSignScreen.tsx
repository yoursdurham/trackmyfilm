"use client";

import { useEffect, useState } from "react";
import type { DisplayOrientation } from "@/lib/display";
import { isShopOpen, RETAIL_HOUR_LINES, RETAIL_HOURS_LABEL } from "@/lib/shop-hours";

function useShopOpen() {
  const [open, setOpen] = useState(() => isShopOpen(new Date()));
  useEffect(() => {
    const tick = () => setOpen(isShopOpen(new Date()));
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);
  return open;
}

export default function OpenSignScreen({
  orientation,
  now,
}: {
  orientation: DisplayOrientation;
  /** Fixed clock for previews. The live screen uses the shop clock. */
  now?: Date;
}) {
  const liveOpen = useShopOpen();
  const open = now ? isShopOpen(now) : liveOpen;
  const wide = orientation === "landscape";
  const word = open ? "OPEN" : "CLOSED";

  return (
    <div
      data-display-mode="open_sign"
      data-open-sign={open ? "open" : "closed"}
      data-open-sign-orientation={orientation}
      data-retail-hours={RETAIL_HOURS_LABEL}
      className="flex h-full w-full flex-col overflow-hidden bg-black font-jetbrains text-[#F4F1EA] select-none"
    >
      <div className={`flex min-h-0 flex-1 items-center justify-center ${wide ? "px-[4vw] py-[3vh]" : "px-[4cqw] py-[4vh]"}`}>
        <div className={`open-sign-tube flex h-full w-full items-center justify-center ${open ? "" : "is-closed"} ${
          wide ? "px-[3vw]" : "px-[3cqw]"
        }`}>
          <p
            data-open-sign-word={word}
            className={`open-sign-word text-center leading-[0.82] font-extrabold tracking-[0.06em] ${open ? "" : "is-closed"} ${
              wide
                ? (open ? "text-[clamp(8rem,28vh,22rem)]" : "text-[clamp(5rem,18vh,14rem)]")
                : (open ? "text-[clamp(4.5rem,20cqw,12rem)]" : "text-[clamp(3rem,13cqw,8rem)]")
            }`}
          >
            {word}
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
