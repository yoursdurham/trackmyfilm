"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Settings = {
  savedProductIds: string[];
  productIds: string[];
  envProductIds: string[];
  apiKeyConfigured: boolean;
};

export default function RewardProductSettings() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const { data } = useQuery<Settings>({
    queryKey: ["reward-settings"],
    queryFn: async () => {
      const response = await fetch("/api/rewards/settings");
      if (!response.ok) throw new Error("Could not load reward settings");
      return response.json();
    },
  });
  const save = useMutation({
    mutationFn: async (productIds: string) => {
      const response = await fetch("/api/rewards/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not save product ids");
    },
    onSuccess: () => {
      setDraft(null);
      toast.success("Reward products saved");
      void queryClient.invalidateQueries({ queryKey: ["reward-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const value = draft ?? (data?.savedProductIds.join(", ") ?? "");

  return (
    <details className="mb-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">Reward products</summary>
      <div className="mt-3 space-y-2">
        <p className="text-sm leading-relaxed text-slate-600">
          Squarespace product ids for development plus a high-res scan, one each for 35mm, 120, and disposable cameras. This is the productId on an order line item, the same id the import reads. Separate them with commas. Leave this blank to use SQUARESPACE_REWARD_PRODUCT_IDS.
        </p>
        <p className="text-sm text-slate-600">
          {data?.apiKeyConfigured
            ? "Squarespace discounts are connected."
            : "SQUARESPACE_DISCOUNTS_API_KEY is not set, so online codes stay off. In-store rewards still work."}
        </p>
        {data && data.savedProductIds.length === 0 && data.envProductIds.length > 0 ? (
          <p className="text-sm text-slate-600">Using product ids from the environment.</p>
        ) : null}
        <textarea
          aria-label="Squarespace reward product ids"
          value={value}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
          className="w-full rounded-md border border-stone-200 px-3 py-2 text-sm text-slate-800"
        />
        <Button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate(value)}
          className="bg-amber-600 text-white hover:bg-amber-700"
        >
          Save product ids
        </Button>
      </div>
    </details>
  );
}
