"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Download, Users, Layers } from "lucide-react";
import {
  calculateTurnaroundForDateRange,
  calculateTurnaroundForPeriod,
  formatTurnaroundDays,
} from "@/lib/turnaround-time";
import { buildReportCsv, calculateReportMetrics } from "@/lib/report-metrics";
import { toast } from "sonner";
import InternalHeader from "@/components/InternalHeader";
import FilmProcessBadge from "@/components/FilmProcessBadge";
import type { FilmOrder } from "@/lib/types";

type TimeFrameKey = "all" | "7d" | "30d" | "90d" | "365d" | "custom";

const TIME_FRAMES: { key: TimeFrameKey; label: string; days?: number }[] = [
  { key: "all", label: "All time" },
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "365d", label: "Last 12 months", days: 365 },
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

const FILM_STOCK_LIST_MAX_HEIGHT_PX = 260;

export default function Reports() {
  const [selectedTimeFrame, setSelectedTimeFrame] = useState<TimeFrameKey>("30d");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const { data: orders = [] } = useQuery<FilmOrder[]>({
    queryKey: ["filmOrders"],
    queryFn: async () => {
      const r = await fetch("/api/orders");
      if (!r.ok) throw new Error("Failed to fetch orders");
      return r.json();
    },
  });

  const customStart = parseDateInput(customStartDate);
  const customEnd = parseDateInput(customEndDate, true);
  const hasCompleteCustomRange = Boolean(customStart && customEnd);
  const hasValidCustomRange = Boolean(
    customStart && customEnd && customStart.getTime() <= customEnd.getTime()
  );
  const customRangeLabel = hasCompleteCustomRange
    ? `${formatDisplayDate(customStartDate)} - ${formatDisplayDate(customEndDate)}`
    : "Custom Date Range";
  const selectedTimeFrameLabel =
    selectedTimeFrame === "custom"
      ? customRangeLabel
      : TIME_FRAMES.find((frame) => frame.key === selectedTimeFrame)?.label ?? "Last 30 days";

  const handleTimeFrameChange = (timeFrame: TimeFrameKey) => {
    setSelectedTimeFrame(timeFrame);
    if (timeFrame !== "custom") {
      setCustomStartDate("");
      setCustomEndDate("");
    }
  };

  const filteredOrders = orders.filter((order) => {
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

  const metrics = calculateReportMetrics(filteredOrders);
  const turnaround =
    selectedTimeFrame === "custom" && hasValidCustomRange && customStart && customEnd
      ? calculateTurnaroundForDateRange(orders, customStart, customEnd)
      : calculateTurnaroundForPeriod(
          orders,
          selectedTimeFrame === "custom" ? "all" : selectedTimeFrame
        );
  const totalScanRolls = metrics.scanResolutionUsage.reduce((sum, item) => sum + item.count, 0);

  const handleExport = () => {
    const csvContent = buildReportCsv({
      generatedAt: new Date().toLocaleString(),
      timeFrameLabel: selectedTimeFrameLabel,
      metrics,
      averageTurnaroundDays: turnaround.averageDays,
      completedOrders: turnaround.orderCount,
    });

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trackmyfilm-report-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast.success("Report exported as CSV");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-orange-50/30 to-amber-50/20">
      <InternalHeader title="Reports" subtitle="Film Lab Analytics" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Analytics Dashboard</h2>
            <p className="text-sm text-slate-500">
              Showing data for{" "}
              <span className="font-semibold text-slate-700">{selectedTimeFrameLabel}</span>
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
            <Button onClick={handleExport} className="bg-amber-600 hover:bg-amber-700 text-white">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          <Card className="border border-stone-100">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Customers</p>
                  <p className="text-3xl font-bold text-slate-800">{metrics.totalCustomers}</p>
                </div>
                <Users className="w-8 h-8 text-amber-500 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-stone-100">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Color Rolls</p>
                  <p className="text-3xl font-bold text-amber-600">{metrics.totalColorRolls}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-amber-100" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-stone-100">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">B/W Rolls</p>
                  <p className="text-3xl font-bold text-gray-600">{metrics.totalBWRolls}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-gray-300" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-stone-100">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">4x6&quot; Prints</p>
                  <p className="text-3xl font-bold text-purple-600">{metrics.total4x6Prints}</p>
                </div>
                <Layers className="w-8 h-8 text-purple-500 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-stone-100" data-testid="blank-rolls-total">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Blank Rolls</p>
                  <p className="text-3xl font-bold text-slate-800">{metrics.totalBlankRolls}</p>
                  <p className="mt-1 text-xs text-slate-500">Included in the roll totals</p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
                  B
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-stone-100">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Avg Turnaround</p>
                  <p className="text-3xl font-bold text-sky-600">{formatTurnaroundDays(turnaround.averageDays)}</p>
                  <p className="mt-1 text-xs text-slate-500">Received at Lab → Scans Sent</p>
                  <p className="text-xs text-slate-500">Blank-only orders left out</p>
                  <p className="text-xs text-slate-500">On hold orders left out</p>
                  {metrics.onHoldOrders > 0 ? (
                    <p className="text-xs text-slate-500">
                      {metrics.onHoldOrders} on hold, not counted as completed
                    </p>
                  ) : null}
                  <p className="text-xs text-slate-500">
                    {turnaround.orderCount} completed order{turnaround.orderCount === 1 ? "" : "s"}
                  </p>
                </div>
                <Clock className="w-8 h-8 text-sky-500 opacity-20" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Distribution Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          <Card className="border border-stone-100">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Film Type Distribution</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">35mm</span>
                  <span className="text-2xl font-bold text-slate-800">{metrics.total35mmRolls}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">120</span>
                  <span className="text-2xl font-bold text-slate-800">{metrics.total120Rolls}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">110</span>
                  <span className="text-2xl font-bold text-slate-800">{metrics.total110Rolls}</span>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between font-semibold">
                  <span className="text-slate-700">Total Rolls</span>
                  <span className="text-2xl text-slate-800">
                    {metrics.total35mmRolls + metrics.total120Rolls + metrics.total110Rolls}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-stone-100">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Film Process Distribution</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <FilmProcessBadge process="Color" className="text-sm text-slate-600" />
                  <span className="text-2xl font-bold text-amber-600">{metrics.totalColorRolls}</span>
                </div>
                <div className="flex items-center justify-between">
                  <FilmProcessBadge process="Black & White" className="text-sm text-slate-600" />
                  <span className="text-2xl font-bold text-gray-600">{metrics.totalBWRolls}</span>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between font-semibold">
                  <span className="text-slate-700">Total Rolls</span>
                  <span className="text-2xl text-slate-800">{metrics.totalColorRolls + metrics.totalBWRolls}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-stone-100" data-testid="blank-rolls-breakdown">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-1">Blank rolls</h3>
              <p className="mb-4 text-xs text-slate-500">
                Same process and format split as the CSV export. These rolls stay inside the totals above.
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Total blank</span>
                  <span className="text-2xl font-bold text-slate-800">{metrics.totalBlankRolls}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Blank color</span>
                  <span className="text-2xl font-bold text-amber-600">{metrics.blankColorRolls}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Blank B/W</span>
                  <span className="text-2xl font-bold text-gray-600">{metrics.blankBWRolls}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Blank both</span>
                  <span className="text-2xl font-bold text-slate-800">{metrics.blankBothRolls}</span>
                </div>
                {metrics.blankOtherProcessRolls > 0 ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Blank other process</span>
                    <span className="text-2xl font-bold text-slate-800">{metrics.blankOtherProcessRolls}</span>
                  </div>
                ) : null}
                <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Blank 35mm</span>
                    <span className="text-2xl font-bold text-slate-800">{metrics.blank35mmRolls}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Blank 120</span>
                    <span className="text-2xl font-bold text-slate-800">{metrics.blank120Rolls}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Blank 110</span>
                    <span className="text-2xl font-bold text-slate-800">{metrics.blank110Rolls}</span>
                  </div>
                  {metrics.blankOtherFormatRolls > 0 ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Blank other format</span>
                      <span className="text-2xl font-bold text-slate-800">{metrics.blankOtherFormatRolls}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-stone-100">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Scan Resolution Distribution</h3>
              {metrics.scanResolutionUsage.length > 0 ? (
                <div className="space-y-3">
                  {metrics.scanResolutionUsage.map((item) => (
                    <div key={item.resolution} className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">{item.resolution}</span>
                      <span className="text-2xl font-bold text-slate-800">{item.count}</span>
                    </div>
                  ))}
                  <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between font-semibold">
                    <span className="text-slate-700">Total Rolls</span>
                    <span className="text-2xl text-slate-800">{totalScanRolls}</span>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500">No scan resolution data available</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Film Stock Usage */}
        <Card className="flex h-[340px] max-h-[340px] flex-col gap-0 overflow-hidden border border-stone-100 py-0">
          <CardHeader className="shrink-0 px-4 py-3">
            <CardTitle className="text-base font-semibold text-slate-800">Film Stock Usage</CardTitle>
          </CardHeader>

          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {metrics.filmStockUsage.length > 0 ? (
              <>
                <div className="grid shrink-0 grid-cols-2 border-b border-stone-200 px-4 py-2 text-xs font-medium text-slate-600">
                  <div>Film Stock</div>
                  <div className="text-right">Times Used</div>
                </div>

                <div
                  className="min-h-0 shrink-0 overflow-y-auto overscroll-contain"
                  style={{
                    height: FILM_STOCK_LIST_MAX_HEIGHT_PX,
                    maxHeight: FILM_STOCK_LIST_MAX_HEIGHT_PX,
                    overflowY: "auto",
                  }}
                >
                  {metrics.filmStockUsage.map((item, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-2 border-b border-stone-100 px-4 py-1.5 text-xs last:border-b-0"
                    >
                      <div className="truncate text-slate-700">{item.stock}</div>
                      <div className="text-right font-semibold text-slate-800">{item.count}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="px-4 py-4 text-xs text-slate-500">No film stock data available</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
