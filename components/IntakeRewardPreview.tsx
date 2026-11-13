"use client";

import { useState } from "react";
import IntakeRewardOffer from "@/components/IntakeRewardOffer";

/** Local layout check for the intake reward. Production never renders this. */
export default function IntakeRewardPreview() {
  const [rewardId, setRewardId] = useState("preview-reward");
  const [rollIndex, setRollIndex] = useState(0);
  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16">
      <IntakeRewardOffer
        rewards={[
          { id: "preview-reward", status: "earned", promoCode: null },
          { id: "preview-issued", status: "issued", promoCode: "TMF-K7MQ2P" },
        ]}
        rolls={[
          { index: 0, label: "Roll 1 · 35mm" },
          { index: 1, label: "Roll 2 · 120" },
          { index: 2, label: "Roll 3 · Disposable Camera" },
        ]}
        rewardId={rewardId}
        rollIndex={rollIndex}
        onRewardId={setRewardId}
        onRollIndex={setRollIndex}
      />
    </div>
  );
}
