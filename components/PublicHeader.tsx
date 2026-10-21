"use client";

import Link from "next/link";

type PublicHeaderProps = {
  /** The tracking page uses this title as its h1. Other public pages keep their own. */
  heading?: "h1" | "p";
};

const LETTERS = [
  { char: "Y", color: "#DDB1B1" },
  { char: "o", color: "#C5AED7" },
  { char: "u", color: "#A1CC93" },
  { char: "r", color: "#C5AED7" },
  { char: "s", color: "#DDB1B1" },
] as const;

/** Lets the tracking page drop order results even when that search lives only in memory. */
export const TRACKING_HOME_EVENT = "trackmyfilm-home";

export default function PublicHeader({ heading = "h1" }: PublicHeaderProps) {
  const Tag = heading;

  return (
    <header className="bg-[#FFF6D3]">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 pb-8 pt-8 text-center sm:gap-4 sm:px-6 lg:flex-row lg:justify-center lg:gap-6 lg:px-8 lg:pb-10 lg:pt-10 lg:text-left">
        <Link
          href="/"
          aria-label="Yours, Durham"
          onClick={() => window.dispatchEvent(new Event(TRACKING_HOME_EVENT))}
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFF6D3]"
        >
          <span
            aria-hidden="true"
            className="inline-flex items-baseline font-jetbrains text-6xl font-bold leading-none tracking-tight sm:text-7xl lg:text-8xl"
          >
            {LETTERS.map((letter) => (
              <span key={letter.char} style={{ color: letter.color }}>
                {letter.char}
              </span>
            ))}
            <span className="relative inline-block text-[#C5AED7]">
              ,
              <span
                className="absolute inset-0 text-[#A1CC93]"
                style={{ clipPath: "inset(84% 0 0 0)" }}
              >
                ,
              </span>
            </span>
          </span>
        </Link>
        <Tag className="font-jetbrains text-sm font-bold leading-snug tracking-tight text-neutral-900 sm:text-xl lg:whitespace-nowrap">
          Track My Film
          <span className="ml-1 font-normal text-neutral-800 sm:ml-2">
            - A Project by Yours, Durham
          </span>
        </Tag>
      </div>
    </header>
  );
}
