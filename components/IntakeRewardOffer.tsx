/**
 * Staff intake: a customer has a free dev + high-res scan they can use on one roll.
 */

export type IntakeRewardChoice = {
  id: string;
  status: "earned" | "issued";
  promoCode: string | null;
};

export type IntakeRewardRoll = {
  index: number;
  label: string;
};

export default function IntakeRewardOffer({
  rewards,
  rolls,
  rewardId,
  rollIndex,
  onRewardId,
  onRollIndex,
}: {
  rewards: IntakeRewardChoice[];
  rolls: IntakeRewardRoll[];
  rewardId: string;
  rollIndex: number;
  onRewardId: (id: string) => void;
  onRollIndex: (index: number) => void;
}) {
  if (rewards.length === 0) return null;
  return (
    <fieldset data-testid="intake-reward" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <legend className="px-1 text-sm font-semibold text-slate-800">Free dev + high-res scan</legend>
      <p className="text-sm leading-relaxed text-slate-700">
        This customer has a reward on their account. Apply it to one 35mm, 120, or disposable roll. Yours, covers development and a high-res scan for that roll.
        {rewards.some((reward) => reward.status === "issued")
          ? " Applying an issued code voids it, so it cannot also be used online."
          : ""}
      </p>
      <label className="block space-y-1 text-sm text-slate-700">
        <span className="font-medium">Reward</span>
        <select
          value={rewardId}
          onChange={(event) => onRewardId(event.target.value)}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
        >
          <option value="">Do not apply a reward</option>
          {rewards.map((reward, index) => (
            <option key={reward.id} value={reward.id}>
              {reward.promoCode ? `Online code ${reward.promoCode}` : `Reward ${index + 1}`}
            </option>
          ))}
        </select>
      </label>
      {rewardId && rolls.length === 0 ? (
        <p className="text-sm text-slate-700">Choose a 35mm, 120, or disposable roll before applying this reward.</p>
      ) : null}
      {rewardId && rolls.length > 0 ? (
        <label className="block space-y-1 text-sm text-slate-700">
          <span className="font-medium">Roll</span>
          <select
            value={String(rollIndex)}
            onChange={(event) => onRollIndex(Number(event.target.value))}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
          >
            {rolls.map((roll) => (
              <option key={roll.index} value={roll.index}>{roll.label}</option>
            ))}
          </select>
        </label>
      ) : null}
    </fieldset>
  );
}
