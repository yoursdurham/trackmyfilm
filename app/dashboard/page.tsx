"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Film, Clock, CheckCircle, Package, Loader2, Hand } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import InternalHeader, { openNewDropoffDialog } from "@/components/InternalHeader";
import OrderCard from "@/components/OrderCard";
import BulkStatusActionBar from "@/components/BulkStatusActionBar";
import { getUrgentAgeDays, isUrgent } from "@/lib/order-urgency";
import { ORDER_STATUS } from "@/lib/constants";
import type { FilmOrder } from "@/lib/types";

const statusFilters = [
  { value: "all",                label: "All",      mobileLabel: "All",    icon: Film },
  { value: "Received by Yours",  label: "Received", mobileLabel: "Recvd",  icon: Clock },
  { value: "Received at Lab",    label: "At Lab",   mobileLabel: "Lab",    icon: Package },
  { value: "Ready for Pickup",   label: "Ready",    mobileLabel: "Ready",  icon: Hand },
  { value: "Scans Sent",         label: "Sent",     mobileLabel: "Sent",   icon: CheckCircle },
  { value: "urgent",             label: "Urgent",   mobileLabel: "Urg",    icon: Clock },
];

type TimeFrameKey = "all" | "7d" | "30d" | "90d" | "365d" | "custom";

const TIME_FRAMES: { key: TimeFrameKey; label: string; days?: number }[] = [
  { key: "all", label: "All Time" },
  { key: "7d", label: "Last 7 Days", days: 7 },
  { key: "30d", label: "Last 30 Days", days: 30 },
  { key: "90d", label: "Last 90 Days", days: 90 },
  { key: "365d", label: "Last 12 Months", days: 365 },
  { key: "custom", label: "Custom Date Range" },
];

function getDateForOrder(order: FilmOrder) {
  return new Date(order.created_at || order.dropoff_date);
}

function parseDateInput(date: string, endOfDay = false) {
  if (!date) return null;
  const parsed = new Date(`${date}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDisplayDate(date: string) {
  const parsed = parseDateInput(date);
  if (!parsed) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

export default function Dashboard() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTimeFrame, setSelectedTimeFrame] = useState<TimeFrameKey>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery<FilmOrder[]>({
    queryKey: ["filmOrders"],
    queryFn: async () => {
      const r = await fetch("/api/orders");
      if (!r.ok) throw new Error("Failed to fetch orders");
      return r.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const data = await r.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to delete order");
      }
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["filmOrders"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const handleStatusChange = async (id: string, status: string, wetransferLink?: string, force?: boolean, sendEmail?: boolean) => {
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: id, new_status: status, wetransfer_link: wetransferLink, force, send_email: sendEmail }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Order updated to ${status}`);
        queryClient.invalidateQueries({ queryKey: ["filmOrders"] });
      } else {
        toast.error(data.error || "Failed to update order");
      }
    } catch {
      toast.error("Failed to update order");
    }
  };

  const customStart = parseDateInput(customStartDate);
  const customEnd = parseDateInput(customEndDate, true);
  const hasCompleteCustomRange = Boolean(customStart && customEnd);
  const hasValidCustomRange = Boolean(
    customStart && customEnd && customStart.getTime() <= customEnd.getTime()
  );
  const customRangeLabel = hasCompleteCustomRange
    ? `${formatDisplayDate(customStartDate)} - ${formatDisplayDate(customEndDate)}`
    : "Custom Date Range";
  const selectedTimeFrameLabel = selectedTimeFrame === "custom"
    ? customRangeLabel
    : TIME_FRAMES.find((frame) => frame.key === selectedTimeFrame)?.label ?? "All Time";

  const handleTimeFrameChange = (timeFrame: TimeFrameKey) => {
    setSelectedTimeFrame(timeFrame);
    if (timeFrame !== "custom") {
      setCustomStartDate("");
      setCustomEndDate("");
    }
  };

  const dateFilteredOrders = orders.filter((order) => {
    if (selectedTimeFrame === "all") return true;

    if (selectedTimeFrame === "custom") {
      if (!hasCompleteCustomRange || !hasValidCustomRange || !customStart || !customEnd) {
        return true;
      }
      const orderDate = getDateForOrder(order);
      return orderDate >= customStart && orderDate <= customEnd;
    }

    const timeFrame = TIME_FRAMES.find((frame) => frame.key === selectedTimeFrame);
    if (!timeFrame?.days) return true;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - timeFrame.days);
    return getDateForOrder(order) >= cutoff;
  });

  const filteredOrders = dateFilteredOrders
    .filter((order) => {
      const matchesFilter = activeFilter === "all" ||
        (activeFilter === "urgent" ? isUrgent(order) : order.status === activeFilter);
      const matchesSearch = !searchQuery ||
        order.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.order_number?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    })
    .sort((a, b) => {
      if (activeFilter !== "urgent") return 0;
      return (getUrgentAgeDays(b) ?? 0) - (getUrgentAgeDays(a) ?? 0);
  });

  const statusCounts = {
    "Received by Yours": dateFilteredOrders.filter((o) => o.status === "Received by Yours").length,
    "Received at Lab":   dateFilteredOrders.filter((o) => o.status === "Received at Lab").length,
    "Ready for Pickup":  dateFilteredOrders.filter((o) => o.status === "Ready for Pickup").length,
    "Scans Sent":        dateFilteredOrders.filter((o) => o.status === "Scans Sent").length,
  };

  const isReceivedTab = activeFilter === ORDER_STATUS.RECEIVED_BY_YOURS;
  const showBulkSelection = isReceivedTab;

  useEffect(() => {
    if (!isReceivedTab) setSelectedOrderIds(new Set());
  }, [isReceivedTab]);

  const visibleOrderIds = filteredOrders.map((order) => order.id);
  const allVisibleSelected = visibleOrderIds.length > 0 &&
    visibleOrderIds.every((id) => selectedOrderIds.has(id));

  const toggleOrderSelection = (orderId: string, selected: boolean) => {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      if (selected) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    setSelectedOrderIds(new Set(visibleOrderIds));
  };

  const handleClearSelection = () => {
    setSelectedOrderIds(new Set());
  };

  const handleBulkUpdateComplete = () => {
    const count = selectedOrderIds.size;
    setSelectedOrderIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["filmOrders"] });
    toast.success(`Updated ${count} order${count === 1 ? "" : "s"} to ${ORDER_STATUS.RECEIVED_AT_LAB}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-orange-50/30 to-amber-50/20">
      <InternalHeader />

      <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 ${showBulkSelection && selectedOrderIds.size > 0 ? "pb-28" : ""}`}>
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">
              Showing orders for <span className="font-semibold text-slate-700">{selectedTimeFrameLabel}</span>
            </p>
            {selectedTimeFrame === "custom" && hasCompleteCustomRange && !hasValidCustomRange ? (
              <p className="mt-1 text-sm font-medium text-red-500">Start date cannot be after end date.</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap gap-2">
              {TIME_FRAMES.map((frame) => (
                <button
                  key={frame.key}
                  type="button"
                  onClick={() => handleTimeFrameChange(frame.key)}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${selectedTimeFrame === frame.key ? "border-amber-500 bg-amber-500 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
                >
                  {frame.label}
                </button>
              ))}
            </div>
            {selectedTimeFrame === "custom" ? (
              <div className="flex flex-col gap-2 rounded-xl border border-stone-100 bg-white p-3 sm:flex-row sm:items-center">
                <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Start
                  <input
                    type="date"
                    value={customStartDate}
                    max={customEndDate || undefined}
                    onChange={(event) => setCustomStartDate(event.target.value)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-700 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  End
                  <input
                    type="date"
                    value={customEndDate}
                    min={customStartDate || undefined}
                    onChange={(event) => setCustomEndDate(event.target.value)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-700 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  />
                </label>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6 lg:grid-cols-4">
          {[
            { label: "Received by Yours", count: statusCounts["Received by Yours"], labelClass: "text-[#A77B43]" },
            { label: "Received at Lab",   count: statusCounts["Received at Lab"],   labelClass: "text-[#806A91]" },
            { label: "Ready for Pickup",  count: statusCounts["Ready for Pickup"],  labelClass: "text-amber-600" },
            { label: "Scans Sent",        count: statusCounts["Scans Sent"],        labelClass: "text-[#5E8068]" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-stone-100">
              <p className="text-2xl font-bold text-slate-800">{stat.count}</p>
              <p className={`text-xs sm:text-sm leading-snug ${stat.labelClass}`}>{stat.label}</p>
            </div>
          ))}
        </div>

        {showBulkSelection ? (
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectAllVisible}
                disabled={filteredOrders.length === 0}
                className="border-stone-200 bg-white text-slate-600 hover:bg-stone-50"
              >
                {allVisibleSelected ? "All visible selected" : "Select all visible"}
              </Button>
              {selectedOrderIds.size > 0 ? (
                <span className="text-sm text-slate-500">
                  {selectedOrderIds.size} selected
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <Tabs value={activeFilter} onValueChange={setActiveFilter} className="w-full sm:w-auto">
            <TabsList className="border border-slate-200 bg-white h-9">
              {statusFilters.map((f) => (
                <TabsTrigger key={f.value} value={f.value} className="flex items-center gap-1 text-xs px-2 sm:px-3">
                  <f.icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">{f.label}</span>
                  <span className="sm:hidden">{f.mobileLabel}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Search by name or order #" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-stone-200" />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
              <Film className="w-8 h-8 text-stone-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-700 mb-1">No drop-offs found</h3>
            <p className="text-slate-500 mb-4">
              {searchQuery || activeFilter !== "all" || selectedTimeFrame !== "all" ? "Try adjusting your filters" : "Add your first drop-off to get started"}
            </p>
            {!searchQuery && activeFilter === "all" && selectedTimeFrame === "all" && (
              <Button onClick={openNewDropoffDialog} variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50">
                <Plus className="w-4 h-4 mr-2" /> New Drop-off
              </Button>
            )}
          </div>
        ) : (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredOrders.map((order) => (
                <motion.div key={order.id} layout
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}>
                  <OrderCard order={order} onStatusChange={handleStatusChange}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    onOrderUpdated={() => queryClient.invalidateQueries({ queryKey: ["filmOrders"] })}
                    selectable={showBulkSelection}
                    selected={selectedOrderIds.has(order.id)}
                    onSelectedChange={(selected) => toggleOrderSelection(order.id, selected)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      {showBulkSelection ? (
        <BulkStatusActionBar
          selectedCount={selectedOrderIds.size}
          selectedOrderIds={[...selectedOrderIds]}
          onClearSelection={handleClearSelection}
          onBulkUpdateComplete={handleBulkUpdateComplete}
        />
      ) : null}
    </div>
  );
}
