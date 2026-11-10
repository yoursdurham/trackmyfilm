import { punchCardCaption, REWARD_ROLLS_PER_REWARD } from "@/lib/rewards";

/**
 * Ten spots, two rows of five. A filled spot is one counted roll toward
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
      <ol aria-label={caption} className="grid grid-cols-5 gap-2 sm:gap-3">
        {Array.from({ length: goal }, (_, index) => {
          const filled = index < count;
          const rewardSpot = index === goal - 1;
          return (
            <li key={index} aria-hidden="true" className="flex justify-center">
              <span
                className={[
                  "flex size-11 items-center justify-center rounded-full border-2 border-neutral-900 font-jetbrains text-[0.62rem] font-bold leading-none sm:size-14 sm:text-xs",
                  filled ? "bg-[#A1CC93] text-neutral-900" : "bg-white text-neutral-700",
                ].join(" ")}
              >
                {rewardSpot ? (
                  <span className="px-1 text-center">Free</span>
                ) : filled ? (
                  <span className="size-2.5 rounded-full bg-neutral-900" />
                ) : null}
              </span>
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
