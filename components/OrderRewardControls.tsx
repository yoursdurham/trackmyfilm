"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isQualifyingRewardRoll } from "@/lib/rewards";
import type { FilmOrder } from "@/lib/types";

type Board = {
  ready: boolean;
  redemptions: { orderId: string; rewardId: string; rollIndex: number | null; via: "in_store" }[];
  available: { customerId: string; id: string; status: "earned" | "issued"; promoCode: string | null }[];
};

export default function OrderRewardControls({ order }: { order: FilmOrder }) {
  const queryClient = useQueryClient();
  const [rewardId, setRewardId] = useState("");
  const [rollIndex, setRollIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const { data } = useQuery<Board>({
    queryKey: ["reward-board"],
    queryFn: async () => {
      const response = await fetch("/api/rewards/board");
      if (!response.ok) throw new Error("Could not load rewards");
      return response.json();
    },
    staleTime: 30_000,
  });

  if (!data?.ready || !order.customer_id) return null;
  const applied = data.redemptions.filter((entry) => entry.orderId === order.id);
  const available = data.available.filter((entry) => entry.customerId === order.customer_id);
  const rolls = order.roll_details?.length
    ? order.roll_details
    : Array.from({ length: Math.max(0, order.roll_count || 0) }, () => ({ film_type: order.film_type }));
  const used = new Set(applied.map((entry) => entry.rollIndex));
  const choices = rolls.flatMap((roll, index) => (
    isQualifyingRewardRoll(roll) && !used.has(index)
      ? [{ index, label: `Roll ${index + 1} · ${roll.film_type}` }]
      : []
  ));

  const apply = async () => {
    setPending(true);
    try {
      const response = await fetch(`/api/orders/${order.id}/reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardId, rollIndex }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not apply the reward");
      toast.success("Reward applied to this order");
      await queryClient.invalidateQueries({ queryKey: ["reward-board"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not apply the reward");
    } finally {
      setPending(false);
    }
  };

  if (applied.length === 0 && (available.length === 0 || choices.length === 0)) return null;

  return (
    <section data-testid="order-reward" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-800">Reward</h4>
      {applied.map((entry) => (
        <p key={entry.rewardId} className="text-sm font-medium text-slate-800">
          Yours, applied a free development and high-res scan
          {entry.rollIndex != null ? ` on roll ${entry.rollIndex + 1}` : ""}.
        </p>
      ))}
      {available.length > 0 && choices.length > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block flex-1 text-sm text-slate-700">
            <span className="mb-1 block font-medium">Available reward</span>
            <select
              value={rewardId}
              onChange={(event) => setRewardId(event.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Choose a reward</option>
              {available.map((reward, index) => (
                <option key={reward.id} value={reward.id}>
                  {reward.promoCode ? `Void code ${reward.promoCode}` : `Reward ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
          <label className="block flex-1 text-sm text-slate-700">
            <span className="mb-1 block font-medium">Roll</span>
            <select
              value={String(rollIndex)}
              onChange={(event) => setRollIndex(Number(event.target.value))}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {choices.map((choice) => (
                <option key={choice.index} value={choice.index}>{choice.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!rewardId || pending}
            onClick={() => { void apply(); }}
            className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            {pending ? "Applying…" : "Apply to this roll"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
