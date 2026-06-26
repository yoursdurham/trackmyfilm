"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, X } from "lucide-react";
import { ORDER_STATUS } from "@/lib/constants";

type BulkUpdateResponse = {
  success: boolean;
  successCount: number;
  failureCount: number;
  failures?: { orderId: string; error: string }[];
  error?: string;
};

interface Props {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkUpdateComplete: () => void;
  selectedOrderIds: string[];
}

export default function BulkStatusActionBar({
  selectedCount,
  onClearSelection,
  onBulkUpdateComplete,
  selectedOrderIds,
}: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  if (selectedCount === 0) return null;

  const targetStatus = ORDER_STATUS.RECEIVED_AT_LAB;

  const handleConfirmUpdate = async () => {
    setIsUpdating(true);
    try {
      const res = await fetch("/api/orders/bulk-status-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: selectedOrderIds, status: targetStatus }),
      });
      const data = await res.json() as BulkUpdateResponse;

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update orders");
      }

      if (data.failureCount > 0) {
        const firstError = data.failures?.[0]?.error;
        const detail = firstError ? ` First error: ${firstError}` : "";
        throw new Error(
          `Updated ${data.successCount} of ${selectedCount} orders. ${data.failureCount} failed.${detail}`
        );
      }

      onBulkUpdateComplete();
    } catch (err: unknown) {
      throw err;
    } finally {
      setIsUpdating(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-amber-200/80 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-slate-700">
            {selectedCount} order{selectedCount === 1 ? "" : "s"} selected
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              onClick={() => setShowConfirm(true)}
              disabled={isUpdating}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Mark as At Lab
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClearSelection}
              disabled={isUpdating}
              className="border-stone-200 text-slate-600 hover:bg-stone-50"
            >
              <X className="mr-1.5 h-4 w-4" />
              Clear Selection
            </Button>
          </div>
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
            <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isUpdating}
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
