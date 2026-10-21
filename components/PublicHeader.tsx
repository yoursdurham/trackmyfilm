"use client";

import Link from "next/link";

type PublicHeaderProps = {
  /** The tracking page uses this title as its h1. Other public pages keep their own. */
  heading?: "h1" | "p";
};

const COLORS = ["#DDB1B1", "#C5AED7", "#A1CC93"] as const;
const WORDMARK = "Track My Film";

const WORDMARK_WORDS = (() => {
  const words: { word: string; letters: { char: string; color: string }[] }[] = [];
  let colorIndex = 0;
  for (const word of WORDMARK.split(" ")) {
    const letters = [];
    for (const char of word) {
      letters.push({ char, color: COLORS[colorIndex % COLORS.length] });
      colorIndex += 1;
    }
    words.push({ word, letters });
  }
  return words;
})();

/** Lets the tracking page drop order results even when that search lives only in memory. */
export const TRACKING_HOME_EVENT = "trackmyfilm-home";

function WordmarkLetters() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex max-w-full flex-wrap items-baseline justify-center gap-x-[0.28em] font-jetbrains text-[2.15rem] font-bold leading-none tracking-tight min-[400px]:text-[2.45rem] sm:text-5xl lg:text-6xl"
    >
      {WORDMARK_WORDS.map(({ word, letters }) => (
        <span key={word} className="inline-flex">
          {letters.map((letter) => (
            <span key={`${word}-${letter.char}`} style={{ color: letter.color }}>
              {letter.char}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

export default function PublicHeader({ heading = "h1" }: PublicHeaderProps) {
  const Tag = heading;

  return (
    <header className="bg-[#FFF6D3]">
      <div className="mx-auto flex max-w-5xl flex-col items-center px-4 pb-8 pt-8 text-center sm:px-6 lg:px-8 lg:pb-10 lg:pt-10">
        <Tag className="m-0 max-w-full">
          <Link
            href="/"
            onClick={() => window.dispatchEvent(new Event(TRACKING_HOME_EVENT))}
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFF6D3]"
          >
            <span className="sr-only">Track My Film</span>
            <WordmarkLetters />
          </Link>
        </Tag>
        <p className="mt-2 font-jetbrains text-sm font-normal leading-relaxed text-neutral-800 sm:text-base">
          A Project by Yours, Durham
        </p>
      </div>
    </header>
  );
}
