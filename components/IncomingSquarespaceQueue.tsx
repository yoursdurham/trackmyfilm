"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { openIncomingDraft } from "@/components/InternalHeader";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { IncomingSquarespaceDraft, RollDetail } from "@/lib/types";

function formatDraftDate(date: string | null) {
  if (!date) return "No drop-off date";
  try {
    return format(parseISO(date), "MMM d, yyyy");
  } catch {
    return date;
  }
}

function summarizeRoll(roll: RollDetail) {
  const parts: string[] = [roll.film_type, roll.film_process];
  if (roll.scan_size) parts.push(roll.scan_size);
  if (roll.prints_4x6) parts.push("4x6 prints");
  if (roll.film_stock) parts.push(roll.film_stock);
  return parts.join(" · ");
}

export default function IncomingSquarespaceQueue() {
  const queryClient = useQueryClient();
  const [dismissTarget, setDismissTarget] = useState<IncomingSquarespaceDraft | null>(null);

  const { data: drafts = [], isLoading, isError } = useQuery<IncomingSquarespaceDraft[]>({
    queryKey: ["incomingDrafts"],
    queryFn: async () => {
      const response = await fetch("/api/incoming-drafts");
      if (!response.ok) throw new Error("Failed to load incoming Squarespace orders");
      return response.json();
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/incoming-drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Failed to dismiss draft");
      return data;
    },
    onSuccess: () => {
      toast.success("Squarespace order dismissed");
      setDismissTarget(null);
      queryClient.invalidateQueries({ queryKey: ["incomingDrafts"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <section className="mb-6 rounded-xl border border-stone-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Inbox className="h-4 w-4 text-amber-600" />
          Incoming from Squarespace
        </h2>
        {!isLoading && !isError ? (
          <span className="text-xs font-medium text-slate-500">
            {drafts.length} pending
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
          Loading incoming orders
        </div>
      ) : isError ? (
        <p className="py-4 text-sm text-red-600">Could not load incoming Squarespace orders.</p>
      ) : drafts.length === 0 ? (
        <p className="py-3 text-sm text-slate-500">
          No Squarespace orders waiting. New ones show up here for review before they are logged.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-100">
          {drafts.map((draft) => (
            <li key={draft.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-slate-800">
                  {draft.squarespace_order_number}
                  <span className="font-normal text-slate-500"> · {draft.customer_name}</span>
                </p>
                <p className="truncate text-sm text-slate-500">
                  {draft.customer_email || "No email"}
                  {" · "}
                  {formatDraftDate(draft.dropoff_date)}
                  {" · "}
                  {draft.roll_count} {draft.roll_count === 1 ? "roll" : "rolls"}
                </p>
                {draft.roll_details.length > 0 ? (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                    {draft.roll_details.map(summarizeRoll).join("; ")}
                  </p>
                ) : null}
                {draft.notes ? (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">Notes: {draft.notes}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-slate-200"
                  onClick={() => setDismissTarget(draft)}
                >
                  Dismiss
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-amber-600 text-white hover:bg-amber-700"
                  onClick={() => openIncomingDraft(draft)}
                >
                  Review
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={Boolean(dismissTarget)} onOpenChange={(open) => { if (!open) setDismissTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss this Squarespace order?</AlertDialogTitle>
            <AlertDialogDescription>
              {dismissTarget
                ? `${dismissTarget.squarespace_order_number} for ${dismissTarget.customer_name} will stay out of the queue and will not become a drop-off.`
                : "This order will stay out of the queue and will not become a drop-off."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dismissMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={dismissMutation.isPending || !dismissTarget}
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (dismissTarget) dismissMutation.mutate(dismissTarget.id);
              }}
            >
              {dismissMutation.isPending ? "Dismissing..." : "Dismiss"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
