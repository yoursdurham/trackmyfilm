"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { punchCardCaption, REWARD_ROLLS_PER_REWARD } from "@/lib/rewards";

/** Same curve as the homepage miles rings in MilesSavedCard. */
export const PUNCH_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
/** Short stagger, inside the 80–150ms range, so each roll lands on its own. */
export const PUNCH_STAGGER_MS = 120;
export const PUNCH_POP_MS = 420;
export const PUNCH_FLOURISH_MS = 420;
const PUNCH_DROP = "translateY(-6px) scale(0.86)";

/** Rolls revealed so far. The first one starts with the animation, then one every stagger. */
export function punchShownCount(elapsedMs: number, count: number): number {
  if (count <= 0) return 0;
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  return Math.min(count, Math.floor(elapsed / PUNCH_STAGGER_MS) + 1);
}

/** When a full card's last spot pulses, after that spot has finished dropping in. */
export function punchFlourishDelay(count: number, goal: number): number | null {
  if (count <= 0 || count < goal) return null;
  return (count - 1) * PUNCH_STAGGER_MS + PUNCH_POP_MS;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function earnedRolls(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>("[data-earned-roll]")];
}

/**
 * Front view of a 35mm cartridge: straight sides, nearly square corners,
 * flat end rims, a short square spool post, and a leader with sprocket
 * holes along both edges. Body is 26×40 (0.65 : 1).
 */
function FilmCartridge({ filled }: { filled: boolean }) {
  const stroke = filled ? "#171717" : "#a8a29e";
  const fill = filled ? "#A1CC93" : "none";
  const hole = filled ? "#171717" : "none";
  const dash = filled ? undefined : "2.4 1.6";
  const shape = {
    fill,
    stroke,
    strokeWidth: 1.6,
    strokeLinejoin: "miter" as const,
    strokeDasharray: dash,
  };
  const sprocket = {
    width: 2.8,
    height: 2.8,
    fill: hole,
    stroke: filled ? "none" : stroke,
    strokeWidth: filled ? 0 : 0.8,
  };
  const topHoles = [35.3, 38.8, 42.3, 45.8];
  return (
    <svg viewBox="0 0 58 58" className="h-auto w-full" aria-hidden="true">
      <rect x="8" y="10" width="26" height="40" rx="1" {...shape} />
      <rect x="5" y="7" width="32" height="3.4" rx="0.4" {...shape} />
      <rect x="5" y="49.6" width="32" height="3.4" rx="0.4" {...shape} />
      <rect x="18.4" y="2.6" width="5.2" height="4.6" rx="0.4" {...shape} />
      <line x1="11" y1="27" x2="31" y2="27" stroke={stroke} strokeWidth="1.1" strokeDasharray={dash} />
      <path d="M34 20 H49 L55 27 V40 H34 Z" {...shape} />
      {topHoles.map((x) => (
        <rect key={`t-${x}`} x={x} y="21.5" {...sprocket} />
      ))}
      {topHoles.map((x) => (
        <rect key={`b-${x}`} x={x} y="35.6" {...sprocket} />
      ))}
    </svg>
  );
}

/**
 * Ten spots, two rows of five. A filled cartridge is one counted roll toward
 * the next free dev + high-res scan. The last spot is that reward.
 */
export default function RewardPunchCard({
  punched,
  total = REWARD_ROLLS_PER_REWARD,
}: {
  punched: number;
  total?: number;
}) {
  const goal = Math.max(1, Math.trunc(total));
  const count = Math.max(0, Math.min(goal, Math.trunc(Number.isFinite(punched) ? punched : 0)));
  const caption = punchCardCaption(count, goal);
  const restingCaption = punchCardCaption(0, goal);
  const spacer = restingCaption.length > caption.length ? restingCaption : caption;
  const figureRef = useRef<HTMLElement>(null);
  const captionRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const root = figureRef.current;
    const node = captionRef.current;
    if (!root || !node || count === 0 || prefersReducedMotion()) return;
    node.textContent = restingCaption;
    for (const roll of earnedRolls(root)) {
      roll.style.transition = "none";
      roll.style.opacity = "0";
      roll.style.transform = PUNCH_DROP;
    }
  }, [count, restingCaption]);

  useEffect(() => {
    const root = figureRef.current;
    const node = captionRef.current;
    if (!root || !node) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const timers: number[] = [];
    let played = false;

    const showFinal = () => {
      node.textContent = caption;
      for (const roll of earnedRolls(root)) {
        roll.getAnimations().forEach((animation) => animation.cancel());
        roll.style.transition = "none";
        roll.style.opacity = "1";
        roll.style.transform = "none";
      }
    };

    if (media.matches || count === 0) {
      showFinal();
      return;
    }

    const play = () => {
      if (played) return;
      played = true;
      const rolls = earnedRolls(root);
      for (const roll of rolls) {
        const index = Number(roll.dataset.rollIndex || "0");
        const delay = index * PUNCH_STAGGER_MS;
        roll.style.transition = `opacity ${PUNCH_POP_MS}ms ${PUNCH_EASE} ${delay}ms, transform ${PUNCH_POP_MS}ms ${PUNCH_EASE} ${delay}ms`;
      }
      frame = requestAnimationFrame(() => {
        for (const roll of rolls) {
          roll.style.opacity = "1";
          roll.style.transform = "none";
        }
        const start = performance.now();
        const tick = (now: number) => {
          const shown = punchShownCount(now - start, count);
          node.textContent = punchCardCaption(shown, goal);
          if (shown < count) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      });

      const flourishAt = punchFlourishDelay(count, goal);
      const last = rolls.find((roll) => roll.dataset.rewardSpot != null);
      if (flourishAt != null && last) {
        timers.push(window.setTimeout(() => {
          last.style.transition = "none";
          last.animate(
            [
              { transform: "scale(1)" },
              { transform: "scale(1.07)", offset: 0.45 },
              { transform: "scale(1)" },
            ],
            { duration: PUNCH_FLOURISH_MS, easing: PUNCH_EASE },
          );
        }, flourishAt));
      }
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
      for (const timer of timers) window.clearTimeout(timer);
      observer.disconnect();
      showFinal();
    };
    media.addEventListener("change", settle);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      for (const timer of timers) window.clearTimeout(timer);
      media.removeEventListener("change", settle);
    };
  }, [caption, count, goal]);

  return (
    <figure ref={figureRef} data-testid="reward-punch-card" className="space-y-3">
      <ol aria-label={caption} className="grid grid-cols-5 gap-1.5 sm:gap-3">
        {Array.from({ length: goal }, (_, index) => {
          const filled = index < count;
          const rewardSpot = index === goal - 1;
          return (
            <li key={index} aria-hidden="true" className="flex flex-col items-center gap-0.5">
              <div className="relative w-full">
                <FilmCartridge filled={false} />
                {filled ? (
                  <div
                    data-earned-roll=""
                    data-roll-index={index}
                    data-reward-spot={rewardSpot ? "" : undefined}
                    className="absolute inset-0"
                  >
                    <FilmCartridge filled />
                  </div>
                ) : null}
              </div>
              {rewardSpot ? (
                <span className="font-jetbrains text-[0.62rem] font-bold leading-none text-neutral-900 sm:text-xs">
                  Free
                </span>
              ) : (
                <span className="h-2.5 sm:h-3" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
      <figcaption className="font-jetbrains text-sm font-bold leading-relaxed text-neutral-900">
        <span className="sr-only">{caption}</span>
        <span aria-hidden="true" className="grid">
          <span className="invisible col-start-1 row-start-1">{spacer}</span>
          <span ref={captionRef} data-testid="reward-punch-count" className="col-start-1 row-start-1">
            {caption}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}
