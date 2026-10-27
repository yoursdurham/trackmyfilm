"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, X } from "lucide-react";
import { ORDER_STATUS } from "@/lib/constants";

type OrderFailure = { orderId: string; orderNumber?: string; error: string };

type BulkUpdateResponse = {
  success: boolean;
  summary?: string;
  failureCount: number;
  emailFailures?: OrderFailure[];
  failures?: OrderFailure[];
  error?: string;
};

export type BulkStatusCompletion = {
  summary: string;
  statusFailureIds: string[];
  emailFailureCount: number;
};

type BulkReport = {
  summary: string;
  status: string;
  emailFailures: OrderFailure[];
  statusFailures: OrderFailure[];
};

interface Props {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkUpdateComplete: (result: BulkStatusCompletion) => void;
  onReportChange?: (visible: boolean) => void;
  selectedOrderIds: string[];
}

const VISIBLE_EMAIL_FAILURES = 8;

export default function BulkStatusActionBar({
  selectedCount,
  onClearSelection,
  onBulkUpdateComplete,
  onReportChange,
  selectedOrderIds,
}: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [report, setReport] = useState<BulkReport | null>(null);

  const targetStatus = ORDER_STATUS.RECEIVED_AT_LAB;
  const busy = isUpdating || retrying;

  const rememberReport = (next: BulkReport | null) => {
    setReport(next);
    onReportChange?.(next !== null);
  };

  const postUpdate = async (orderIds: string[], emailsOnly: boolean) => {
    const res = await fetch("/api/orders/bulk-status-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds, status: targetStatus, emailsOnly }),
    });
    const data = await res.json() as BulkUpdateResponse;
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to update orders");
    }
    return data;
  };

  const handleConfirmUpdate = async () => {
    setIsUpdating(true);
    try {
      const data = await postUpdate(selectedOrderIds, false);
      const summary = data.summary ?? "Orders updated";
      const emailFailures = data.emailFailures ?? [];
      const statusFailures = data.failures ?? [];
      rememberReport({ summary, status: targetStatus, emailFailures, statusFailures });
      onBulkUpdateComplete({
        summary,
        statusFailureIds: (data.failures ?? []).map((failure) => failure.orderId),
        emailFailureCount: emailFailures.length,
      });
    } finally {
      setIsUpdating(false);
      setShowConfirm(false);
    }
  };

  const retryFailedEmails = async () => {
    if (!report || report.emailFailures.length === 0) return;
    setRetrying(true);
    try {
      const data = await postUpdate(report.emailFailures.map((failure) => failure.orderId), true);
      const summary = data.summary ?? "Retried emails";
      rememberReport({
        summary,
        status: report.status,
        emailFailures: data.emailFailures ?? [],
        statusFailures: data.failures ?? [],
      });
      const { toast } = await import("sonner");
      if ((data.emailFailures ?? []).length > 0) toast.error(summary);
      else toast.success(summary);
    } catch (err: unknown) {
      const { toast } = await import("sonner");
      toast.error(err instanceof Error ? err.message : "Failed to retry emails");
    } finally {
      setRetrying(false);
    }
  };

  if (selectedCount === 0 && !report) return null;

  const hiddenEmailFailures = report
    ? Math.max(0, report.emailFailures.length - VISIBLE_EMAIL_FAILURES)
    : 0;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-amber-200/80 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-3">
          {report ? (
            <div data-testid="bulk-status-summary" className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-slate-800">{report.summary}</p>
                <button
                  type="button"
                  onClick={() => rememberReport(null)}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  Dismiss
                </button>
              </div>
              {report.statusFailures.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {report.statusFailures.slice(0, VISIBLE_EMAIL_FAILURES).map((failure) => (
                    <li key={failure.orderId}>
                      <span className="font-semibold text-slate-700">{failure.orderNumber ?? failure.orderId}</span>
                      {" was not moved: "}
                      {failure.error}
                    </li>
                  ))}
                </ul>
              ) : null}
              {report.emailFailures.length > 0 ? (
                <div className="mt-2">
                  <ul className="space-y-1 text-xs text-slate-600">
                    {report.emailFailures.slice(0, VISIBLE_EMAIL_FAILURES).map((failure) => (
                      <li key={failure.orderId}>
                        <span className="font-semibold text-slate-700">{failure.orderNumber ?? failure.orderId}</span>
                        {" email failed: "}
                        {failure.error}
                      </li>
                    ))}
                  </ul>
                  {hiddenEmailFailures > 0 ? (
                    <p className="mt-1 text-xs text-slate-500">and {hiddenEmailFailures} more</p>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="bulk-email-retry"
                    onClick={retryFailedEmails}
                    disabled={busy}
                    className="mt-2 border-stone-200 text-slate-700 hover:bg-white"
                  >
                    {retrying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Retry failed emails
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {selectedCount > 0 ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-slate-700">
                {selectedCount} order{selectedCount === 1 ? "" : "s"} selected
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  onClick={() => setShowConfirm(true)}
                  disabled={busy}
                  className="bg-amber-600 text-white hover:bg-amber-700"
                >
                  {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Mark as At Lab
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClearSelection}
                  disabled={busy}
                  className="border-stone-200 text-slate-600 hover:bg-stone-50"
                >
                  <X className="mr-1.5 h-4 w-4" />
                  Clear Selection
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move orders to lab?</AlertDialogTitle>
            <AlertDialogDescription>
              Update {selectedCount} selected order{selectedCount === 1 ? "" : "s"} to{" "}
              <span className="font-semibold text-slate-800">{targetStatus}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (event) => {
                event.preventDefault();
                try {
                  await handleConfirmUpdate();
                } catch (err: unknown) {
                  const { toast } = await import("sonner");
                  toast.error(err instanceof Error ? err.message : "Failed to update orders");
                }
              }}
            >
              {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Update {selectedCount} order{selectedCount === 1 ? "" : "s"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
