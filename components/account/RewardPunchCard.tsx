import { punchCardCaption, REWARD_ROLLS_PER_REWARD } from "@/lib/rewards";

/**
 * A 35mm cartridge with a short strip of leader. Drawn as one path so the
 * empty state can be a dashed outline and the earned state a solid stamp.
 * Sprocket holes are rectangles, not dots.
 */
function FilmCartridge({ filled }: { filled: boolean }) {
  const stroke = filled ? "#171717" : "#a8a29e";
  const fill = filled ? "#A1CC93" : "none";
  const hole = filled ? "#171717" : "none";
  return (
    <svg viewBox="0 0 44 48" className="h-11 w-10 sm:h-14 sm:w-12" aria-hidden="true">
      <path
        d="M10 6h16a4 4 0 0 1 4 4v6h8v16h-8v6a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeDasharray={filled ? undefined : "2.4 2.2"}
      />
      <rect x="31.2" y="19.2" width="3.2" height="2.4" rx="0.3" fill={hole} stroke={stroke} strokeWidth="0.8" />
      <rect x="31.2" y="26.4" width="3.2" height="2.4" rx="0.3" fill={hole} stroke={stroke} strokeWidth="0.8" />
      {filled ? <path d="M12 11h8" stroke="#171717" strokeWidth="1.4" strokeLinecap="square" /> : null}
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
