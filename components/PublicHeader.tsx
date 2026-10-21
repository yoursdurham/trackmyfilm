"use client";

import Link from "next/link";

type PublicHeaderProps = {
  /** The tracking page uses this title as its h1. Other public pages keep their own. */
  heading?: "h1" | "p";
};

const COLORS = ["#DDB1B1", "#C5AED7", "#A1CC93"] as const;
const WORDMARK = "Track My Film";

/** User units. textLength matches this width so the phrase fills the card. */
const MARK_WIDTH = 780;
const MARK_HEIGHT = 118;
const MARK_BASELINE = 90;

const WORDMARK_GLYPHS = (() => {
  const glyphs: { char: string; color: string; key: string }[] = [];
  let colorIndex = 0;
  for (const [index, char] of WORDMARK.split("").entries()) {
    const color = char === " " ? "transparent" : COLORS[colorIndex % COLORS.length];
    if (char !== " ") colorIndex += 1;
    glyphs.push({ char, color, key: `${index}-${char}` });
  }
  return glyphs;
})();

/** Lets the tracking page drop order results even when that search lives only in memory. */
export const TRACKING_HOME_EVENT = "trackmyfilm-home";

function Wordmark() {
  return (
    <svg
      viewBox={`0 0 ${MARK_WIDTH} ${MARK_HEIGHT}`}
      className="block h-auto w-full overflow-visible"
      aria-hidden="true"
    >
      <text
        x="0"
        y={MARK_BASELINE}
        textLength={MARK_WIDTH}
        lengthAdjust="spacingAndGlyphs"
        fontFamily="var(--font-jetbrains), ui-monospace, monospace"
        fontSize="100"
        fontWeight="700"
      >
        {WORDMARK_GLYPHS.map((glyph) => (
          <tspan key={glyph.key} fill={glyph.color}>
            {glyph.char}
          </tspan>
        ))}
      </text>
    </svg>
  );
}

export default function PublicHeader({ heading = "h1" }: PublicHeaderProps) {
  const Tag = heading;

  return (
    <header className="bg-[#FFF6D3]">
      <div className="mx-auto w-full max-w-5xl px-4 pb-8 pt-8 sm:px-6 lg:px-8 lg:pb-10 lg:pt-10">
        <Tag className="m-0 w-full">
          <Link
            href="/"
            onClick={() => window.dispatchEvent(new Event(TRACKING_HOME_EVENT))}
            className="block w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFF6D3]"
          >
            <span className="sr-only">Track My Film</span>
            <Wordmark />
          </Link>
        </Tag>
        <p className="mt-2 text-center font-jetbrains text-sm font-normal leading-relaxed text-neutral-800 sm:text-base">
          A Project by Yours, Durham
        </p>
      </div>
    </header>
  );
}
