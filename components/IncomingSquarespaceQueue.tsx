"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { openIncomingDraft } from "@/components/InternalHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { SquarespaceCheckSummary } from "@/lib/squarespace-orders";
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

function CheckSummary({ summary }: { summary: SquarespaceCheckSummary }) {
  if (!summary.configured) {
    return (
      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {summary.message}
      </p>
    );
  }
  return (
    <div className="mt-3 rounded-lg bg-stone-50 px-3 py-2 text-sm text-slate-700">
      <p>
        Imported {summary.imported}. Skipped {summary.skippedDuplicate} already in the system. Skipped {summary.skippedNoFilm} with no film processing.
      </p>
      {summary.importedOrderNumbers.length > 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          New: {summary.importedOrderNumbers.join(", ")}
        </p>
      ) : null}
      {summary.errors.length > 0 ? (
        <ul className="mt-2 list-disc pl-4 text-xs text-red-700">
          {summary.errors.slice(0, 10).map((error, index) => (
            <li key={`${error.orderNumber ?? "error"}-${index}`}>
              {error.orderNumber ? `${error.orderNumber}: ` : ""}
              {error.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function IncomingSquarespaceQueue() {
  const queryClient = useQueryClient();
  const [dismissTarget, setDismissTarget] = useState<IncomingSquarespaceDraft | null>(null);
  const [sendEmailById, setSendEmailById] = useState<Record<string, boolean>>({});
  const [checkSummary, setCheckSummary] = useState<SquarespaceCheckSummary | null>(null);

  const { data: drafts = [], isLoading, isError } = useQuery<IncomingSquarespaceDraft[]>({
    queryKey: ["incomingDrafts"],
    queryFn: async () => {
      const response = await fetch("/api/incoming-drafts");
      if (!response.ok) throw new Error("Failed to load incoming Squarespace orders");
      return response.json();
    },
  });

  const receiveMutation = useMutation({
    mutationFn: async ({ id, send_email }: { id: string; send_email: boolean }) => {
      const response = await fetch(`/api/incoming-drafts/${id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send_email }),
      });
      const data = await response.json().catch(() => null) as { error?: string; email?: { sent?: boolean; skipped?: boolean; error?: string } } | null;
      if (!response.ok) throw new Error(data?.error ?? "Failed to receive order");
      return data;
    },
    onSuccess: (data) => {
      if (data?.email?.sent) toast.success("Confirmation email sent");
      else if (data?.email?.skipped) toast.info(data.email.error ? `No email: ${data.email.error}` : "Confirmation email skipped");
      else if (data?.email?.error) toast.error(`Received, but email failed: ${data.email.error}`);
      toast.success("Marked Received by Yours");
      queryClient.invalidateQueries({ queryKey: ["incomingDrafts"] });
      queryClient.invalidateQueries({ queryKey: ["filmOrders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const checkMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/incoming-drafts/check", { method: "POST" });
      const data = await response.json().catch(() => null) as (SquarespaceCheckSummary & { error?: string }) | null;
      if (!response.ok || !data) throw new Error(data?.error ?? "Could not check Squarespace");
      return data;
    },
    onSuccess: (summary) => {
      setCheckSummary(summary);
      if (summary.imported > 0) {
        queryClient.invalidateQueries({ queryKey: ["incomingDrafts"] });
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/incoming-drafts/${id}`, { method: "DELETE" });
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Inbox className="h-4 w-4 text-amber-600" />
          Pending Intake
        </h2>
        <div className="flex items-center gap-3">
          {!isLoading && !isError ? (
            <span className="text-xs font-medium text-slate-500">
              {drafts.length} pending
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-slate-200"
            disabled={checkMutation.isPending}
            onClick={() => checkMutation.mutate()}
          >
            {checkMutation.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Checking
              </>
            ) : "Check Squarespace"}
          </Button>
        </div>
      </div>
      {checkSummary ? <CheckSummary summary={checkSummary} /> : null}

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
          Loading incoming orders
        </div>
      ) : isError ? (
        <p className="py-4 text-sm text-red-600">Could not load incoming Squarespace orders.</p>
      ) : drafts.length === 0 ? (
        <p className="py-3 text-sm text-slate-500">
          No Squarespace orders waiting. Imported orders stay here until you physically receive the film and click Approve &amp; Receive.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-100">
          {drafts.map((draft) => (
            <li key={draft.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-slate-800">
                  <span className="mr-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Pending Intake</span>
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
              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <Checkbox
                    checked={sendEmailById[draft.id] !== false}
                    onCheckedChange={(checked) => {
                      setSendEmailById((current) => ({ ...current, [draft.id]: checked === true }));
                    }}
                  />
                  Send confirmation email
                </label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-slate-200"
                    onClick={() => openIncomingDraft(draft)}
                  >
                    Edit
                  </Button>
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
                    disabled={receiveMutation.isPending}
                    onClick={() => receiveMutation.mutate({
                      id: draft.id,
                      send_email: sendEmailById[draft.id] !== false,
                    })}
                  >
                    Approve & Receive
                  </Button>
                </div>
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
                ? `${dismissTarget.squarespace_order_number} for ${dismissTarget.customer_name} will be deleted. It will not become a drop-off, and that Squarespace order can be imported again.`
                : "It will be deleted and will not become a drop-off. That Squarespace order can be imported again."}
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
