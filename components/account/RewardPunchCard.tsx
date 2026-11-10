import { punchCardCaption, REWARD_ROLLS_PER_REWARD } from "@/lib/rewards";

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

  return (
    <figure data-testid="reward-punch-card" className="space-y-3">
      <ol aria-label={caption} className="grid grid-cols-5 gap-1.5 sm:gap-3">
        {Array.from({ length: goal }, (_, index) => {
          const filled = index < count;
          const rewardSpot = index === goal - 1;
          return (
            <li key={index} aria-hidden="true" className="flex flex-col items-center gap-0.5">
              <FilmCartridge filled={filled} />
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
        {caption}
      </figcaption>
    </figure>
  );
}
