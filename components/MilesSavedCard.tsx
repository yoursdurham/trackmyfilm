"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import {
  formatMiles,
  lapRings,
  lapsCaption,
} from "@/lib/miles-saved";
import WindowFrame from "@/components/WindowFrame";

const GLOBE = "#A1CC93";
const GRID = "#2A2A2A";
const PROGRESS = "#DDB1B1";
const TRACK = "#E8D5C8";

const GLOBE_R = 54;
const RING_STROKE = 10;
const FIRST_RING_R = GLOBE_R + 16;
const RING_STEP = 15;
const DRAW_MS = 1500;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function ringPlan(laps: number) {
  const fractions = lapRings(laps).slice(-4);
  const animated = fractions.filter((fraction) => fraction > 0).length;
  const stagger = animated > 1 ? 180 : 0;
  const duration = DRAW_MS - stagger * Math.max(0, animated - 1);
  let delay = 0;
  const rings = fractions.map((fraction, index) => {
    const startDelay = fraction > 0 ? delay : 0;
    if (fraction > 0) delay += stagger;
    const radius = FIRST_RING_R + index * RING_STEP;
    const circumference = 2 * Math.PI * radius;
    return {
      radius,
      fraction,
      length: fraction * circumference,
      circumference,
      delay: startDelay,
      duration,
    };
  });
  return rings;
}

function EarthGlobe({ cx, cy }: { cx: number; cy: number }) {
  const r = GLOBE_R;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={GLOBE} />
      <g clipPath="url(#miles-saved-globe-clip)">
        <g fill="none" stroke={GRID} strokeWidth="1.6">
          <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.28} />
          <ellipse cx={cx} cy={cy - r * 0.42} rx={r * 0.74} ry={r * 0.15} />
          <ellipse cx={cx} cy={cy + r * 0.42} rx={r * 0.74} ry={r * 0.15} />
          <ellipse cx={cx} cy={cy} rx={r * 0.28} ry={r} />
          <ellipse cx={cx} cy={cy} rx={r * 0.62} ry={r} />
          <path d={`M ${cx} ${cy - r} V ${cy + r}`} />
        </g>
      </g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={GRID} strokeWidth="1.8" />
    </g>
  );
}

function ProgressRings({ cx, cy, laps }: { cx: number; cy: number; laps: number }) {
  const rings = ringPlan(laps);
  return (
    <g>
      {rings.map((ring) => (
        <g key={ring.radius}>
          <circle
            cx={cx}
            cy={cy}
            r={ring.radius}
            fill="none"
            stroke={TRACK}
            strokeWidth={RING_STROKE}
          />
          {ring.fraction > 0 ? (
            <circle
              cx={cx}
              cy={cy}
              r={ring.radius}
              fill="none"
              stroke={PROGRESS}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={`${ring.length} ${ring.circumference}`}
              strokeDashoffset={0}
              transform={`rotate(-90 ${cx} ${cy})`}
              data-ring-length={ring.length}
              data-ring-delay={ring.delay}
              data-ring-duration={ring.duration}
            />
          ) : null}
        </g>
      ))}
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
      className="mx-auto w-[min(100%,15rem)] lg:w-full"
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

function ringCircles(root: HTMLElement) {
  return [...root.querySelectorAll<SVGCircleElement>("[data-ring-length]")];
}

function showFinalRings(root: HTMLElement) {
  for (const circle of ringCircles(root)) {
    circle.style.transition = "none";
    circle.setAttribute("stroke-dashoffset", "0");
  }
}

export default function MilesSavedCard({
  miles,
  laps,
  year,
}: {
  miles: number;
  laps: number;
  year: number;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const numberRef = useRef<HTMLSpanElement>(null);
  const finalMiles = formatMiles(miles);

  useLayoutEffect(() => {
    const root = sectionRef.current;
    const number = numberRef.current;
    if (!root || !number || prefersReducedMotion()) return;
    number.textContent = formatMiles(0);
    for (const circle of ringCircles(root)) {
      circle.style.transition = "none";
      circle.setAttribute("stroke-dashoffset", circle.dataset.ringLength || "0");
    }
  }, [miles, laps]);

  useEffect(() => {
    const root = sectionRef.current;
    const number = numberRef.current;
    if (!root || !number) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const showFinal = () => {
      number.textContent = finalMiles;
      showFinalRings(root);
    };

    if (media.matches) {
      showFinal();
      return;
    }

    const play = () => {
      const circles = ringCircles(root);
      for (const circle of circles) {
        const duration = circle.dataset.ringDuration || String(DRAW_MS);
        const delay = circle.dataset.ringDelay || "0";
        circle.style.transition = `stroke-dashoffset ${duration}ms ${EASE} ${delay}ms`;
      }
      frame = requestAnimationFrame(() => {
        for (const circle of circles) circle.setAttribute("stroke-dashoffset", "0");
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / DRAW_MS);
          const eased = 1 - (1 - progress) ** 3;
          number.textContent = formatMiles(Math.round(miles * eased));
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      });
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        play();
      },
      { threshold: 0.4 },
    );
    observer.observe(root);

    const settle = () => {
      if (!media.matches) return;
      cancelAnimationFrame(frame);
      observer.disconnect();
      showFinal();
    };
    media.addEventListener("change", settle);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      media.removeEventListener("change", settle);
    };
  }, [finalMiles, miles]);

  return (
    <section ref={sectionRef} aria-labelledby="miles-saved-heading" className="mb-14 w-full">
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
              <span className="sr-only">{finalMiles}</span>
              <span aria-hidden="true" className="inline-grid">
                <span className="invisible col-start-1 row-start-1">{finalMiles}</span>
                <span ref={numberRef} className="col-start-1 row-start-1">{finalMiles}</span>
              </span>
            </p>
            <p className="mt-2 font-jetbrains text-[1.02rem] font-bold text-neutral-900 sm:text-[1.15rem]">
              miles of driving to Raleigh
            </p>
            <p className="mt-1 text-[0.95rem] text-slate-600">{lapsCaption(laps)}</p>
          </div>

          <div className="order-2 my-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:my-0">
            <MilesSavedGlobe laps={laps} />
          </div>

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
