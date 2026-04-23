"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Hash, Layers, ChevronDown, Calendar, Trash2, ExternalLink, Clock, ChevronRight, Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import StatusBadge from "./StatusBadge";
import { STATUS_FLOW, STATUS_TEMPLATE_MAP } from "@/lib/constants";
import { isValidWetransferLink, ensureHttps } from "@/lib/validation";
import type { FilmOrder } from "@/lib/types";

interface Props {
  order: FilmOrder;
  onStatusChange: (id: string, status: string, wetransferLink?: string, force?: boolean, sendEmail?: boolean) => Promise<void>;
  onDelete: (id: string) => void;
}

export default function OrderCard({ order, onStatusChange, onDelete }: Props) {
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showForceDialog, setShowForceDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [wetransferLink, setWetransferLink] = useState("");
  const [sendScanEmail, setSendScanEmail] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
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
                  className="flex-1 text-xs h-7 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => { navigator.clipboard.writeText(order.wetransfer_link!); toast.success("Link copied!"); }}>
                  <Copy className="w-3 h-3 mr-1" /> Copy link
                </Button>
                <Button size="sm" variant="outline"
                  className="flex-1 text-xs h-7 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
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
                    entry.status === "Received by Yours" ? "bg-blue-500" :
                    entry.status === "Received at Lab"   ? "bg-amber-500" : "bg-emerald-500"
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
              render={<Button variant="outline" size="sm" disabled={isUpdating} className="w-full justify-between text-slate-600 hover:text-amber-700 hover:border-amber-200 hover:bg-amber-50" />}
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
                    className={order.status === status ? "bg-amber-50 text-amber-700" : ""}>
                    <span className={`w-2 h-2 rounded-full mr-2 ${
                      status === "Received by Yours" ? "bg-blue-500" :
                      status === "Received at Lab"   ? "bg-amber-500" : "bg-emerald-500"
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
              render={<Button variant="outline" size="sm" disabled={isUpdating} className="text-red-500 hover:text-red-700 hover:border-red-200 hover:bg-red-50" />}
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
