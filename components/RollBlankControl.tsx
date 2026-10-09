"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isBlankRoll, rollDetailsWithBlankToggled } from "@/lib/blank-roll";
import type { FilmOrder } from "@/lib/types";

export function BlankRollBadge() {
  return (
    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-white">
      Blank
    </span>
  );
}

export function RollBlankButton({
  blank,
  pending = false,
  onClick,
}: {
  blank: boolean;
  pending?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={blank}
      disabled={pending}
      onClick={onClick}
      className="h-7 shrink-0 border-slate-200 px-2 text-xs text-slate-700 hover:border-slate-400 hover:bg-slate-100"
    >
      {pending ? (
        <>
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          Saving...
        </>
      ) : blank ? (
        "Undo blank"
      ) : (
        "Mark roll as blank"
      )}
    </Button>
  );
}

export function useToggleRollBlank(order: FilmOrder) {
  const queryClient = useQueryClient();
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const canToggle = Boolean(order.roll_details?.length);

  const toggle = async (index: number) => {
    const source = order.roll_details;
    if (!source?.length) return;
    const next = rollDetailsWithBlankToggled(source, index);
    if (!next) return;

    setPendingIndex(index);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roll_details: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to update roll");
      }
      toast.success(isBlankRoll(next[index]) ? "Roll marked as blank" : "Blank mark removed");
      await queryClient.invalidateQueries({ queryKey: ["filmOrders"] });
      await queryClient.invalidateQueries({ queryKey: ["customer-profile"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update roll");
    } finally {
      setPendingIndex(null);
    }
  };

  return { canToggle, pendingIndex, toggle };
}
