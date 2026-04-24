"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Hash, Layers, ChevronDown, Calendar, Trash2, ExternalLink, Clock, ChevronRight, Copy, Loader2, RefreshCw, FileText, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import StatusBadge from "./StatusBadge";
import { STATUS_FLOW, STATUS_TEMPLATE_MAP } from "@/lib/constants";
import { isValidWetransferLink, ensureHttps } from "@/lib/validation";
import type { FilmOrder, FilmProcess, FilmType, OrderStatus, RollDetail } from "@/lib/types";

const FILM_TYPES: FilmType[] = ["35mm", "120", "Disposable Camera"];
const FILM_PROCESSES: FilmProcess[] = ["Color", "Black & White", "Both"];

type OrderDraft = {
  order_number: string;
  status: OrderStatus;
  dropoff_date: string;
  roll_count: number;
  wetransfer_link: string;
  notes: string;
  roll_details: RollDetail[];
};

interface Props {
  order: FilmOrder;
  onStatusChange: (id: string, status: string, wetransferLink?: string, force?: boolean, sendEmail?: boolean) => Promise<void>;
  onDelete: (id: string) => void;
  onOrderUpdated?: () => void;
}

export default function OrderCard({ order, onStatusChange, onDelete, onOrderUpdated }: Props) {
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showForceDialog, setShowForceDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [wetransferLink, setWetransferLink] = useState("");
  const [sendScanEmail, setSendScanEmail] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [orderDraft, setOrderDraft] = useState<OrderDraft | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [displayedNotes, setDisplayedNotes] = useState(order.notes ?? "");
  const [notesDraft, setNotesDraft] = useState(order.notes ?? "");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRetryingEmail, setIsRetryingEmail] = useState(false);

  const handleRetryEmail = async () => {
    setIsRetryingEmail(true);
    try {
      const template = STATUS_TEMPLATE_MAP[order.status as keyof typeof STATUS_TEMPLATE_MAP] ?? "film_drop_received";
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.id, template }),
      });
      const data = await res.json() as { error?: string; skipped?: boolean };
      if (!res.ok) throw new Error(data.error ?? "Failed to send email");
      toast.success("Email sent successfully");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setIsRetryingEmail(false);
    }
  };

  const getLastUpdated = () => {
    if (order.status_history?.length) {
      return order.status_history[order.status_history.length - 1].changed_at;
    }
    return order.status_updated_at;
  };

  const lastUpdated = getLastUpdated();

  const currentIdx = STATUS_FLOW.indexOf(order.status);

  useEffect(() => {
    setDisplayedNotes(order.notes ?? "");
    setNotesDraft(order.notes ?? "");
  }, [order.notes]);

  const rollDetails = order.roll_details?.length
    ? order.roll_details
    : order.film_type || order.film_process || order.film_stock || order.prints_4x6
      ? [
          {
            film_type: order.film_type,
            film_process: order.film_process,
            film_stock: order.film_stock,
            prints_4x6: order.prints_4x6,
          },
        ]
      : [];

  const buildOrderDraft = (): OrderDraft => ({
    order_number: order.order_number,
    status: order.status,
    dropoff_date: order.dropoff_date,
    roll_count: order.roll_count,
    wetransfer_link: order.wetransfer_link ?? "",
    notes: displayedNotes,
    roll_details: rollDetails.length
      ? rollDetails
      : [{ film_type: "35mm", film_process: "Color", film_stock: "", prints_4x6: false }],
  });

  const openOrderEditor = () => {
    setOrderDraft(buildOrderDraft());
    setIsEditingOrder(true);
    setIsEditingNotes(false);
  };

  const updateRollDraft = <K extends keyof RollDetail>(
    index: number,
    key: K,
    value: RollDetail[K]
  ) => {
    setOrderDraft((draft) => {
      if (!draft) return draft;
      return {
        ...draft,
        roll_details: draft.roll_details.map((roll, rollIndex) =>
          rollIndex === index ? { ...roll, [key]: value } : roll
        ),
      };
    });
  };

  const handleSaveOrder = async () => {
    if (!orderDraft) return;
    const firstRoll = orderDraft.roll_details[0];

    setIsSavingOrder(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_number: orderDraft.order_number.trim(),
          status: orderDraft.status,
          dropoff_date: orderDraft.dropoff_date,
          roll_count: Number(orderDraft.roll_count) || 1,
          film_type: firstRoll?.film_type,
          film_process: firstRoll?.film_process,
          film_stock: firstRoll?.film_stock || undefined,
          prints_4x6: Boolean(firstRoll?.prints_4x6),
          roll_details: orderDraft.roll_details,
          wetransfer_link: orderDraft.wetransfer_link.trim() || undefined,
          notes: orderDraft.notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to update order");
      }

      toast.success("Order updated");
      setDisplayedNotes(orderDraft.notes.trim());
      setIsEditingOrder(false);
      onOrderUpdated?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update order");
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleStatusChangeClick = (status: string) => {
    const targetIdx = STATUS_FLOW.indexOf(status as typeof STATUS_FLOW[number]);

    // Same status — no-op
    if (order.status === status) return;

    // Backward transition — ask for confirmation
    if (targetIdx < currentIdx) {
      setPendingStatus(status);
      setShowForceDialog(true);
      return;
    }

    // Scans Sent — open dialog for optional WeTransfer link + email toggle
    if (status === "Scans Sent") {
      setWetransferLink(order.wetransfer_link || "");
      setSendScanEmail(true);
      setPendingStatus(status);
      setShowLinkDialog(true);
      return;
    }

    doStatusChange(status);
  };

  const doStatusChange = async (status: string, link?: string, force?: boolean, sendEmail?: boolean) => {
    setIsUpdating(true);
    try {
      await onStatusChange(order.id, status, link, force, sendEmail);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveLinkAndStatus = async () => {
    const raw = wetransferLink.trim();
    if (raw && !isValidWetransferLink(raw)) { toast.error("Please enter a valid WeTransfer link (wetransfer.com)"); return; }
    setShowLinkDialog(false);
    await doStatusChange("Scans Sent", raw ? ensureHttps(raw) : undefined, undefined, sendScanEmail);
  };

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft.trim() || null }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to update notes");
      }

      toast.success("Order notes updated");
      setDisplayedNotes(notesDraft.trim());
      setIsEditingNotes(false);
      onOrderUpdated?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update notes");
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleForceConfirm = async () => {
    setShowForceDialog(false);
    if (!pendingStatus) return;
    await doStatusChange(pendingStatus, undefined, true);
    setPendingStatus(null);
  };

  return (
    <Card className="group bg-white border-0 shadow-sm hover:shadow-md transition-all duration-300">
      <CardContent className="p-5">
        <div className="mb-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-slate-800 text-base truncate">{order.customer_name}</h3>
              {order.customer_email && (
                <p className="text-xs text-slate-500 truncate">{order.customer_email}</p>
              )}
            </div>
            <StatusBadge status={order.status} />
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Hash className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium">{order.order_number}</span>
          </div>
          {order.dropoff_date && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{format(new Date(order.dropoff_date), "MMM d, yyyy")}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>{order.roll_count} roll{order.roll_count > 1 ? "s" : ""}</span>
            {order.film_type && <span className="text-slate-400">• {order.film_type}</span>}
          </div>
          {order.film_process && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="text-slate-400">Process:</span>
              <span>{order.film_process}</span>
            </div>
          )}
          {lastUpdated && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>Updated: {format(new Date(lastUpdated), "MMM d, h:mm a")}</span>
            </div>
          )}
          {order.email_status === "failed" && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
              <p className="text-xs text-red-700">⚠️ Email failed to send</p>
              <button
                onClick={handleRetryEmail}
                disabled={isRetryingEmail}
                className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50 shrink-0"
              >
                {isRetryingEmail
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <RefreshCw className="w-3 h-3" />}
                Retry
              </button>
            </div>
          )}
          {order.status === "Scans Sent" && (
            order.wetransfer_link ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline"
                  className="h-7 flex-1 border-[var(--accent-green)]/40 text-xs text-[#5E8068] hover:bg-[var(--accent-green)]/10"
                  onClick={() => { navigator.clipboard.writeText(order.wetransfer_link!); toast.success("Link copied!"); }}>
                  <Copy className="w-3 h-3 mr-1" /> Copy link
                </Button>
                <Button size="sm" variant="outline"
                  className="h-7 flex-1 border-[var(--accent-green)]/40 text-xs text-[#5E8068] hover:bg-[var(--accent-green)]/10"
                  onClick={() => window.open(order.wetransfer_link, "_blank")}>
                  <ExternalLink className="w-3 h-3 mr-1" /> Open
                </Button>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                <p className="text-xs text-amber-800">⚠️ Missing WeTransfer link</p>
              </div>
            )
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mb-4 h-8 w-full justify-center border-[var(--border-soft)] text-xs text-slate-600 hover:border-[var(--accent-purple)]/40 hover:bg-[var(--accent-purple)]/10 hover:text-[#806A91]"
          onClick={() => setDetailsOpen(true)}
        >
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          View details
        </Button>

        {order.status_history && order.status_history.length > 0 && (
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="mb-4">
            <CollapsibleTrigger
              render={<Button variant="ghost" size="sm" className="w-full justify-between text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-50 px-2 py-1" />}
            >
              <span>Status history ({order.status_history.length})</span>
              <ChevronRight className={`w-3 h-3 transition-transform ${historyOpen ? "rotate-90" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-1">
              {[...order.status_history].reverse().map((entry, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs bg-slate-50 rounded px-2 py-1.5">
                  <span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                    entry.status === "Received by Yours" ? "bg-[var(--accent-tan)]" :
                    entry.status === "Received at Lab"   ? "bg-[var(--accent-purple)]" : "bg-[var(--accent-green)]"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-700">{entry.status}</p>
                    <p className="text-slate-500">{format(new Date(entry.changed_at), "MMM d, h:mm a")}</p>
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="pt-3 border-t border-slate-100 flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" disabled={isUpdating} className="flex-1 min-w-0 justify-between text-slate-600 hover:border-[var(--accent-purple)]/40 hover:bg-[var(--accent-purple)]/10 hover:text-[#806A91]" />}
            >
              {isUpdating
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Updating...</>
                : <><span>Update Status</span><ChevronDown className="w-4 h-4 ml-2" /></>
              }
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {STATUS_FLOW.map((status) => {
                const targetIdx = STATUS_FLOW.indexOf(status);
                const isBackward = targetIdx < currentIdx;
                return (
                  <DropdownMenuItem key={status} onClick={() => handleStatusChangeClick(status)}
                    className={order.status === status ? "bg-[var(--accent-tan)]/35 text-slate-800" : ""}>
                    <span className={`w-2 h-2 rounded-full mr-2 ${
                      status === "Received by Yours" ? "bg-[var(--accent-tan)]" :
                      status === "Received at Lab"   ? "bg-[var(--accent-purple)]" : "bg-[var(--accent-green)]"
                    }`} />
                    {status}
                    {isBackward && <span className="ml-auto text-xs text-slate-400">↩ undo</span>}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <AlertDialog>
            <AlertDialogTrigger
              render={<Button variant="outline" size="sm" disabled={isUpdating} className="w-10 shrink-0 px-0 text-red-500 hover:text-red-700 hover:border-red-200 hover:bg-red-50" />}
            >
              <Trash2 className="w-4 h-4" />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this order?</AlertDialogTitle>
                <AlertDialogDescription>
                  <div className="space-y-2">
                    <p>Are you sure you want to delete this order?</p>
                    <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1 mt-2">
                      <p><strong>Order:</strong> #{order.order_number}</p>
                      <p><strong>Customer:</strong> {order.customer_name}</p>
                      <p><strong>Date:</strong> {order.dropoff_date ? format(new Date(order.dropoff_date), "MMM d, yyyy") : "N/A"}</p>
                      <p><strong>Rolls:</strong> {order.roll_count}</p>
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(order.id)} className="bg-red-600 hover:bg-red-700">
                  Delete permanently
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>

      {/* Full order details */}
      <Dialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) {
            setIsEditingOrder(false);
            setOrderDraft(null);
            setIsEditingNotes(false);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order #{order.order_number}</DialogTitle>
            <DialogDescription>
              Full drop-off details for {order.customer_name}
            </DialogDescription>
          </DialogHeader>

          {isEditingOrder && orderDraft ? (
            <div className="space-y-5 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Order #</label>
                  <Input
                    value={orderDraft.order_number}
                    onChange={(event) =>
                      setOrderDraft((draft) => draft ? { ...draft, order_number: event.target.value } : draft)
                    }
                    className="border-slate-200"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
                  <select
                    value={orderDraft.status}
                    onChange={(event) =>
                      setOrderDraft((draft) => draft ? { ...draft, status: event.target.value as OrderStatus } : draft)
                    }
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-[var(--accent-purple)] focus:ring-2 focus:ring-[var(--accent-purple)]/20"
                  >
                    {STATUS_FLOW.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Drop-off Date</label>
                  <Input
                    type="date"
                    value={orderDraft.dropoff_date}
                    onChange={(event) =>
                      setOrderDraft((draft) => draft ? { ...draft, dropoff_date: event.target.value } : draft)
                    }
                    className="border-slate-200"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Roll Count</label>
                  <Input
                    type="number"
                    min={1}
                    value={orderDraft.roll_count}
                    onChange={(event) =>
                      setOrderDraft((draft) => draft ? { ...draft, roll_count: Number(event.target.value) } : draft)
                    }
                    className="border-slate-200"
                  />
                </div>
              </div>

              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Film Details
                  </h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 border-slate-200 px-2 text-xs"
                    onClick={() =>
                      setOrderDraft((draft) => draft ? {
                        ...draft,
                        roll_count: draft.roll_details.length + 1,
                        roll_details: [
                          ...draft.roll_details,
                          { film_type: "35mm", film_process: "Color", film_stock: "", prints_4x6: false },
                        ],
                      } : draft)
                    }
                  >
                    Add roll
                  </Button>
                </div>

                <div className="space-y-3">
                  {orderDraft.roll_details.map((roll, index) => (
                    <div
                      key={`${order.id}-edit-roll-${index}`}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <p className="font-medium text-slate-800">Roll {index + 1}</p>
                        {orderDraft.roll_details.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                            onClick={() =>
                              setOrderDraft((draft) => draft ? {
                                ...draft,
                                roll_count: Math.max(1, draft.roll_details.length - 1),
                                roll_details: draft.roll_details.filter((_, rollIndex) => rollIndex !== index),
                              } : draft)
                            }
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs text-slate-500">Film Type</label>
                          <select
                            value={roll.film_type}
                            onChange={(event) => updateRollDraft(index, "film_type", event.target.value as FilmType)}
                            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-[var(--accent-purple)] focus:ring-2 focus:ring-[var(--accent-purple)]/20"
                          >
                            {FILM_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-slate-500">Process</label>
                          <select
                            value={roll.film_process}
                            onChange={(event) => updateRollDraft(index, "film_process", event.target.value as FilmProcess)}
                            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-[var(--accent-purple)] focus:ring-2 focus:ring-[var(--accent-purple)]/20"
                          >
                            {FILM_PROCESSES.map((process) => (
                              <option key={process} value={process}>
                                {process}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-slate-500">Film Stock</label>
                          <Input
                            value={roll.film_stock ?? ""}
                            onChange={(event) => updateRollDraft(index, "film_stock", event.target.value)}
                            placeholder="Cinestill 800T"
                            className="border-slate-200"
                          />
                        </div>
                        <label className="flex items-end gap-2 pb-1 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            checked={Boolean(roll.prints_4x6)}
                            onChange={(event) => updateRollDraft(index, "prints_4x6", event.target.checked)}
                            className="mb-1 h-4 w-4 rounded border-slate-300"
                          />
                          4x6 Prints
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">WeTransfer Link</label>
                <Input
                  value={orderDraft.wetransfer_link}
                  onChange={(event) =>
                    setOrderDraft((draft) => draft ? { ...draft, wetransfer_link: event.target.value } : draft)
                  }
                  placeholder="https://wetransfer.com/..."
                  className="border-slate-200"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Order Notes</label>
                <Textarea
                  value={orderDraft.notes}
                  onChange={(event) =>
                    setOrderDraft((draft) => draft ? { ...draft, notes: event.target.value } : draft)
                  }
                  placeholder="Add any notes about this drop-off..."
                  className="min-h-28 border-slate-200"
                  maxLength={1000}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSavingOrder}
                  onClick={() => {
                    setOrderDraft(null);
                    setIsEditingOrder(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isSavingOrder}
                  className="bg-[var(--accent-purple)] text-white hover:bg-[#9D85AD]"
                  onClick={handleSaveOrder}
                >
                  {isSavingOrder ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Order"
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
          <div className="space-y-5 text-sm">
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-[var(--border-soft)] text-xs text-slate-600 hover:border-[var(--accent-purple)]/40 hover:bg-[var(--accent-purple)]/10 hover:text-[#806A91]"
                onClick={openOrderEditor}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit order
              </Button>
            </div>
            <section className="grid gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--card-bg)] p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Customer</p>
                <p className="font-medium text-slate-800">{order.customer_name}</p>
                {order.customer_email ? (
                  <p className="text-slate-500">{order.customer_email}</p>
                ) : null}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Status</p>
                <div className="mt-1">
                  <StatusBadge status={order.status} />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Dropped off</p>
                <p className="font-medium text-slate-800">
                  {order.dropoff_date ? format(new Date(order.dropoff_date), "MMM d, yyyy") : "N/A"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Roll count</p>
                <p className="font-medium text-slate-800">
                  {order.roll_count} roll{order.roll_count > 1 ? "s" : ""}
                </p>
              </div>
            </section>

            {rollDetails.length > 0 ? (
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Film Details
                </h4>
                <div className="space-y-2">
                  {rollDetails.map((roll, index) => (
                    <div
                      key={`${order.id}-detail-roll-${index}`}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                    >
                      <p className="mb-2 font-medium text-slate-800">Roll {index + 1}</p>
                      <div className="flex flex-wrap gap-2">
                        {roll.film_type ? (
                          <span className="rounded-full bg-[var(--accent-tan)] px-2 py-0.5 text-xs font-medium text-[#A77B43]">
                            {roll.film_type}
                          </span>
                        ) : null}
                        {roll.film_process ? (
                          <span className="rounded-full bg-[var(--accent-purple)] px-2 py-0.5 text-xs font-medium text-white">
                            {roll.film_process}
                          </span>
                        ) : null}
                        {roll.film_stock ? (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">
                            {roll.film_stock}
                          </span>
                        ) : null}
                        {roll.prints_4x6 ? (
                          <span className="rounded-full bg-[var(--accent-green)] px-2 py-0.5 text-xs font-medium text-white">
                            4x6 Prints
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Order Notes
                </h4>
                {!isEditingNotes ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 border-[var(--border-soft)] px-2 text-xs text-slate-600 hover:border-[var(--accent-purple)]/40 hover:bg-[var(--accent-purple)]/10 hover:text-[#806A91]"
                    onClick={() => {
                      setNotesDraft(displayedNotes);
                      setIsEditingNotes(true);
                    }}
                  >
                    {displayedNotes ? "Edit" : "Add note"}
                  </Button>
                ) : null}
              </div>

              {isEditingNotes ? (
                <div className="space-y-2">
                  <Textarea
                    value={notesDraft}
                    onChange={(event) => setNotesDraft(event.target.value)}
                    placeholder="Add any notes about this drop-off..."
                    className="min-h-28 border-slate-200"
                    maxLength={1000}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-400">{notesDraft.length}/1000</span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isSavingNotes}
                        onClick={() => {
                          setNotesDraft(displayedNotes);
                          setIsEditingNotes(false);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={isSavingNotes}
                        className="bg-[var(--accent-purple)] text-white hover:bg-[#9D85AD]"
                        onClick={handleSaveNotes}
                      >
                        {isSavingNotes ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "Save notes"
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border border-slate-100 bg-slate-50 p-3 italic text-slate-700">
                  {displayedNotes || "No order notes yet."}
                </p>
              )}
            </section>

            {order.customer_notes ? (
              <section className="space-y-3">
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Customer Notes
                  </h4>
                  <p className="rounded-xl border border-slate-100 bg-slate-50 p-3 italic text-slate-700">
                    {order.customer_notes}
                  </p>
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Last updated</p>
                <p className="text-slate-700">
                  {lastUpdated ? format(new Date(lastUpdated), "MMM d, yyyy h:mm a") : "N/A"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Email status</p>
                <p className="text-slate-700">{order.email_status ?? "N/A"}</p>
              </div>
              {order.wetransfer_link ? (
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">WeTransfer Link</p>
                  <a
                    href={order.wetransfer_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-[#806A91] underline underline-offset-2 hover:no-underline"
                  >
                    {order.wetransfer_link}
                  </a>
                </div>
              ) : null}
            </section>

            {order.status_history?.length ? (
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status History
                </h4>
                <div className="space-y-2">
                  {[...order.status_history].reverse().map((entry, index) => (
                    <div
                      key={`${order.id}-detail-history-${index}`}
                      className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2"
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        entry.status === "Received by Yours" ? "bg-[var(--accent-tan)]" :
                        entry.status === "Received at Lab" ? "bg-[var(--accent-purple)]" : "bg-[var(--accent-green)]"
                      }`} />
                      <div>
                        <p className="font-medium text-slate-700">{entry.status}</p>
                        <p className="text-xs text-slate-500">
                          {format(new Date(entry.changed_at), "MMM d, yyyy h:mm a")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Scans Sent dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Scans Sent</DialogTitle>
            <DialogDescription>Optionally add a WeTransfer link for the customer</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wetransfer">WeTransfer Link <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Input id="wetransfer" value={wetransferLink}
                onChange={(e) => setWetransferLink(e.target.value)}
                placeholder="https://wetransfer.com/..." />
              <p className="text-xs text-slate-500">Must be from wetransfer.com if provided</p>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <Checkbox id="scan-email" checked={sendScanEmail} onCheckedChange={(v) => setSendScanEmail(!!v)} />
              <div>
                <label htmlFor="scan-email" className="text-sm font-medium text-slate-700 cursor-pointer">
                  Send confirmation email
                </label>
                <p className="text-xs text-slate-500">
                  {sendScanEmail ? "Customer will be notified that scans are ready" : "No email will be sent"}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveLinkAndStatus}>Update Status</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Backward transition confirmation */}
      <AlertDialog open={showForceDialog} onOpenChange={setShowForceDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move order backward?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;re moving this order from <strong>{order.status}</strong> back to <strong>{pendingStatus}</strong>.
              This will still send a status email if configured. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingStatus(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleForceConfirm} className="bg-amber-600 hover:bg-amber-700">
              Yes, move back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
