"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rewardHistoryLabel, rewardProgressSentence } from "@/lib/rewards";

type RewardRow = {
  id: string;
  status: string;
  promoCode: string | null;
  validTo: string | null;
  redeemedVia: "online" | "in_store" | null;
  redeemedRollIndex: number | null;
};

type EventRow = {
  id: string;
  kind: string;
  rolls: number;
  reason: string | null;
  createdAt: string;
  rewardId: string | null;
};

type RewardView = {
  ready: boolean;
  progress: number;
  progressTarget: number;
  netRolls: number;
  rewards: RewardRow[];
  events: EventRow[];
  online: { enabled: boolean; message: string | null };
};

export default function CustomerRewardsPanel({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const [rolls, setRolls] = useState("1");
  const [reason, setReason] = useState("");
  const { data, isLoading } = useQuery<RewardView>({
    queryKey: ["customer-rewards", customerId],
    queryFn: async () => {
      const response = await fetch(`/api/customers/${customerId}/rewards`);
      if (!response.ok) throw new Error("Could not load rewards");
      return response.json();
    },
  });

  const adjust = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/customers/${customerId}/rewards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rolls: Number(rolls), reason }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not adjust rewards");
      return body;
    },
    onSuccess: () => {
      setReason("");
      toast.success("Reward balance updated");
      void queryClient.invalidateQueries({ queryKey: ["customer-rewards", customerId] });
      void queryClient.invalidateQueries({ queryKey: ["reward-board"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm" data-testid="staff-rewards">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Rewards</h3>
      {isLoading ? <p className="text-sm text-slate-500">Loading rewards…</p> : null}
      {data && !data.ready ? (
        <p className="text-sm text-slate-600">
          Rewards are not in the database yet. Run migration 032_customer_rewards.sql, then reload this page.
        </p>
      ) : null}
      {data?.ready ? (
        <div className="space-y-4">
          <p className="text-sm font-medium text-slate-800">
            {rewardProgressSentence(data.progress, data.progressTarget)}
          </p>
          <p className="text-sm text-slate-600">{data.netRolls} qualifying rolls on this account.</p>
          {!data.online.enabled && data.online.message ? (
            <p className="text-sm text-slate-600">{data.online.message}</p>
          ) : null}
          <ul className="space-y-2">
            {data.rewards.map((reward) => (
              <li key={reward.id} className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-slate-700">
                <span className="font-medium capitalize">{reward.status}</span>
                {reward.promoCode ? ` · ${reward.promoCode}` : ""}
                {reward.validTo ? ` · through ${format(new Date(reward.validTo), "MMM d, yyyy")}` : ""}
                {reward.redeemedVia === "in_store" ? " · in the shop" : ""}
                {reward.redeemedVia === "online" ? " · online" : ""}
                {reward.redeemedRollIndex != null ? ` · roll ${reward.redeemedRollIndex + 1}` : ""}
              </li>
            ))}
          </ul>
          {data.events.length > 0 ? (
            <ul className="space-y-1">
              {[...data.events].reverse().slice(0, 8).map((event) => {
                const reward = data.rewards.find((entry) => entry.id === event.rewardId);
                return (
                  <li key={event.id} className="text-sm text-slate-600">
                    {rewardHistoryLabel({
                      kind: event.kind,
                      rolls: event.rolls,
                      reason: event.reason,
                      via: reward?.redeemedVia,
                    })}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <form
            className="grid gap-2 sm:grid-cols-[6rem_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              adjust.mutate();
            }}
          >
            <Input
              aria-label="Rolls to add or remove"
              inputMode="numeric"
              value={rolls}
              onChange={(event) => setRolls(event.target.value)}
              className="border-stone-200"
            />
            <Input
              aria-label="Reason for the adjustment"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason"
              className="border-stone-200"
            />
            <Button type="submit" disabled={adjust.isPending} className="bg-amber-600 text-white hover:bg-amber-700">
              Adjust
            </Button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
