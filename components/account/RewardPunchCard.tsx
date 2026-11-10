import { useId } from "react";
import { punchCardCaption, REWARD_ROLLS_PER_REWARD } from "@/lib/rewards";

/**
 * Classic 35mm cassette: upright canister, spool posts, label band,
 * and a leader with rectangular sprocket holes. The leader is drawn
 * past the viewBox so it can hang past the spot.
 */
function FilmCartridge({ filled, clipId }: { filled: boolean; clipId: string }) {
  const stroke = filled ? "#171717" : "#a8a29e";
  const fill = filled ? "#A1CC93" : "none";
  const band = filled ? "#6d9a64" : "none";
  const hole = filled ? "#171717" : "none";
  const dash = filled ? undefined : "2.2 1.7";
  return (
    <svg viewBox="0 0 36 62" overflow="visible" className="h-12 w-7 overflow-visible sm:h-16 sm:w-9" aria-hidden="true">
      <rect x="13" y="0.8" width="10" height="6" rx="2" fill={fill} stroke={stroke} strokeWidth="1.5" strokeDasharray={dash} />
      <rect x="6" y="6" width="24" height="46" rx="11" fill={fill} stroke={stroke} strokeWidth="1.7" strokeDasharray={dash} />
      <clipPath id={clipId}>
        <rect x="6" y="6" width="24" height="46" rx="11" />
      </clipPath>
      <rect x="6" y="24" width="24" height="9" fill={band} clipPath={`url(#${clipId})`} />
      <line x1="8" y1="24" x2="28" y2="24" stroke={stroke} strokeWidth="1.2" strokeDasharray={dash} />
      <line x1="8" y1="33" x2="28" y2="33" stroke={stroke} strokeWidth="1.2" strokeDasharray={dash} />
      <rect x="14.5" y="51.2" width="7" height="5.2" rx="1.6" fill={fill} stroke={stroke} strokeWidth="1.4" strokeDasharray={dash} />
      <path
        d="M28 16h16v16H28"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeDasharray={dash}
      />
      <rect x="32" y="17.4" width="2.3" height="2" fill={hole} stroke={stroke} strokeWidth="0.7" />
      <rect x="36.2" y="17.4" width="2.3" height="2" fill={hole} stroke={stroke} strokeWidth="0.7" />
      <rect x="40.4" y="17.4" width="2.3" height="2" fill={hole} stroke={stroke} strokeWidth="0.7" />
      {filled ? <path d="M12 14h8" stroke="#171717" strokeWidth="1.3" strokeLinecap="square" /> : null}
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
  const uid = useId().replace(/:/g, "");

  return (
    <figure data-testid="reward-punch-card" className="space-y-3">
      <ol aria-label={caption} className="grid grid-cols-5 gap-1.5 sm:gap-3">
        {Array.from({ length: goal }, (_, index) => {
          const filled = index < count;
          const rewardSpot = index === goal - 1;
          return (
            <li key={index} aria-hidden="true" className="flex flex-col items-center gap-0.5">
              <FilmCartridge filled={filled} clipId={`film-${uid}-${index}`} />
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
