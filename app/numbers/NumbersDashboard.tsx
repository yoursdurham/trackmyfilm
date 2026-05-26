"use client";

import { useState } from "react";
import {
  BarChart3,
  CalendarDays,
  DollarSign,
  Film,
  Printer,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import InternalHeader from "@/components/InternalHeader";
import type { FilmOrder } from "@/lib/types";

type LegacyScanOrder = FilmOrder & {
  scan_type?: string | null;
  scan_size?: string | null;
};

type ScanTypeKey = "standard" | "highres" | "tiff";
type TimeFrameKey = "all" | "7d" | "30d" | "90d" | "365d" | "custom";

type ProfitMetrics = {
  orderCount: number;
  scansProfit: number;
  printsProfit: number;
  totalProfit: number;
  averageProfitPerOrder: number;
  todayProfit: number;
  weekProfit: number;
  monthProfit: number;
  scanTypeProfit: Record<ScanTypeKey, number>;
};

const TIME_FRAMES: { key: TimeFrameKey; label: string; days?: number }[] = [
  { key: "all", label: "All Time" },
  { key: "7d", label: "Last 7 Days", days: 7 },
  { key: "30d", label: "Last 30 Days", days: 30 },
  { key: "90d", label: "Last 90 Days", days: 90 },
  { key: "365d", label: "Last 12 Months", days: 365 },
  { key: "custom", label: "Custom Date Range" },
];

const SCAN_PROFIT_BY_TYPE: Record<ScanTypeKey, number> = {
  standard: 11,
  highres: 12,
  tiff: 13,
};

const SCAN_LABELS: Record<ScanTypeKey, string> = {
  standard: "Standard",
  highres: "High Res",
  tiff: "TIFF",
};

const PRINT_PROFIT = 3.50;

function normalizeScanType(scanType?: string | null): ScanTypeKey | null {
  const normalized = scanType?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (normalized === "standard") return "standard";
  if (normalized === "highres") return "highres";
  if (normalized === "tiff") return "tiff";
  return null;
}

function getScanProfit(scanType?: string | null) {
  const normalized = normalizeScanType(scanType);
  return normalized ? SCAN_PROFIT_BY_TYPE[normalized] : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
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

function getOrderDate(order: FilmOrder) {
  return new Date(order.created_at || order.dropoff_date);
}

function getStartOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function getStartOfWeek() {
  const date = getStartOfToday();
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return date;
}

function getStartOfMonth() {
  const date = getStartOfToday();
  date.setDate(1);
  return date;
}

function getOrderProfit(order: FilmOrder) {
  let scansProfit = 0;
  let printsProfit = 0;
  const scanTypeProfit: Record<ScanTypeKey, number> = {
    standard: 0,
    highres: 0,
    tiff: 0,
  };

  if (order.roll_details?.length) {
    order.roll_details.forEach((roll) => {
      const scanType = normalizeScanType(roll.scan_size);
      if (scanType) {
        const profit = SCAN_PROFIT_BY_TYPE[scanType];
        scansProfit += profit;
        scanTypeProfit[scanType] += profit;
      }
      if (roll.prints_4x6) {
        printsProfit += PRINT_PROFIT;
      }
    });
  } else {
    const legacyOrder = order as LegacyScanOrder;
    const rollCount = order.roll_count ?? 0;
    const scanType = normalizeScanType(legacyOrder.scan_type ?? legacyOrder.scan_size);
    if (scanType) {
      const profit = rollCount * getScanProfit(scanType);
      scansProfit += profit;
      scanTypeProfit[scanType] += profit;
    }
    if (order.prints_4x6) {
      printsProfit += rollCount * PRINT_PROFIT;
    }
  }

  return {
    scansProfit,
    printsProfit,
    totalProfit: scansProfit + printsProfit,
    scanTypeProfit,
  };
}

function calculateProfitMetrics(orders: FilmOrder[]): ProfitMetrics {
  const today = getStartOfToday();
  const week = getStartOfWeek();
  const month = getStartOfMonth();
  const scanTypeProfit: Record<ScanTypeKey, number> = {
    standard: 0,
    highres: 0,
    tiff: 0,
  };
  let scansProfit = 0;
  let printsProfit = 0;
  let todayProfit = 0;
  let weekProfit = 0;
  let monthProfit = 0;

  orders.forEach((order) => {
    const orderProfit = getOrderProfit(order);
    const orderDate = getOrderDate(order);

    scansProfit += orderProfit.scansProfit;
    printsProfit += orderProfit.printsProfit;
    scanTypeProfit.standard += orderProfit.scanTypeProfit.standard;
    scanTypeProfit.highres += orderProfit.scanTypeProfit.highres;
    scanTypeProfit.tiff += orderProfit.scanTypeProfit.tiff;

    if (orderDate >= today) todayProfit += orderProfit.totalProfit;
    if (orderDate >= week) weekProfit += orderProfit.totalProfit;
    if (orderDate >= month) monthProfit += orderProfit.totalProfit;
  });

  const totalProfit = scansProfit + printsProfit;

  return {
    orderCount: orders.length,
    scansProfit,
    printsProfit,
    totalProfit,
    averageProfitPerOrder: orders.length ? totalProfit / orders.length : 0,
    todayProfit,
    weekProfit,
    monthProfit,
    scanTypeProfit,
  };
}

function getPercent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  featured = false,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: string;
  featured?: boolean;
}) {
  return (
    <Card className={`border border-stone-100 ${featured ? "bg-slate-900 text-white" : "bg-white"}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={`text-xs uppercase tracking-wide ${featured ? "text-slate-300" : "text-slate-500"}`}>
              {label}
            </p>
            <p className={`mt-2 font-bold tracking-tight ${featured ? "text-4xl" : "text-3xl text-slate-800"}`}>
              {value}
            </p>
          </div>
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-slate-800">{value}</p>
    </div>
  );
}

function BarRow({
  label,
  value,
  percent,
  color,
}: {
  label: string;
  value: string;
  percent: number;
  color: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500">{value}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-stone-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function NumbersDashboard({ orders }: { orders: FilmOrder[] }) {
  const [selectedTimeFrame, setSelectedTimeFrame] = useState<TimeFrameKey>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

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

  const filteredOrders = orders.filter((order) => {
    if (selectedTimeFrame === "all") return true;

    if (selectedTimeFrame === "custom") {
      if (!hasCompleteCustomRange || !hasValidCustomRange || !customStart || !customEnd) {
        return true;
      }
      const orderDate = getOrderDate(order);
      return orderDate >= customStart && orderDate <= customEnd;
    }

    const timeFrame = TIME_FRAMES.find((frame) => frame.key === selectedTimeFrame);
    if (!timeFrame?.days) return true;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - timeFrame.days);
    return getOrderDate(order) >= cutoff;
  });

  const metrics = calculateProfitMetrics(filteredOrders);
  const scansPercent = getPercent(metrics.scansProfit, metrics.totalProfit);
  const printsPercent = getPercent(metrics.printsProfit, metrics.totalProfit);
  const maxScanTypeProfit = Math.max(...Object.values(metrics.scanTypeProfit), 1);
  const topScanType = (Object.entries(metrics.scanTypeProfit) as [ScanTypeKey, number][])
    .sort((a, b) => b[1] - a[1])[0];
  const topInsight = topScanType?.[1] > 0
    ? `Most scan profit comes from ${SCAN_LABELS[topScanType[0]]} scans.`
    : "Scan profit will appear once orders include scan resolution data.";

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-orange-50/30 to-amber-50/20">
      <InternalHeader title="Numbers" subtitle="Admin profit tracking" />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Financial Dashboard</p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Numbers</h2>
            <p className="mt-1 text-sm text-slate-500">
              Profit calculated for <span className="font-semibold text-slate-700">{selectedTimeFrameLabel}</span>
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

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Profit"
            value={formatCurrency(metrics.totalProfit)}
            icon={DollarSign}
            accent="bg-white/10 text-emerald-200"
            featured
          />
          <StatCard
            label="Scans Profit"
            value={formatCurrency(metrics.scansProfit)}
            icon={Film}
            accent="bg-blue-50 text-blue-600"
          />
          <StatCard
            label="Prints Profit"
            value={formatCurrency(metrics.printsProfit)}
            icon={Printer}
            accent="bg-violet-50 text-violet-600"
          />
          <StatCard
            label="Avg Profit / Order"
            value={formatCurrency(metrics.averageProfitPerOrder)}
            icon={TrendingUp}
            accent="bg-amber-50 text-amber-600"
          />
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="border border-stone-100 lg:col-span-1">
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Time Breakdown</h3>
                  <p className="text-xs text-slate-500">Based on order creation date</p>
                </div>
              </div>
              <div className="grid gap-3">
                <MiniStatCard label="Today Profit" value={formatCurrency(metrics.todayProfit)} />
                <MiniStatCard label="This Week Profit" value={formatCurrency(metrics.weekProfit)} />
                <MiniStatCard label="This Month Profit" value={formatCurrency(metrics.monthProfit)} />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-stone-100 lg:col-span-2">
            <CardContent className="p-5">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Profit Mix</h3>
                  <p className="text-xs text-slate-500">Scans versus 4x6 prints</p>
                </div>
              </div>
              <div className="space-y-5">
                <BarRow
                  label={`Scans ${formatPercent(scansPercent)}`}
                  value={formatCurrency(metrics.scansProfit)}
                  percent={scansPercent}
                  color="bg-blue-500"
                />
                <BarRow
                  label={`Prints ${formatPercent(printsPercent)}`}
                  value={formatCurrency(metrics.printsProfit)}
                  percent={printsPercent}
                  color="bg-violet-500"
                />
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="border border-stone-100 lg:col-span-2">
            <CardContent className="p-5">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Film className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Profit by Scan Type</h3>
                  <p className="text-xs text-slate-500">Standard, High Res, and TIFF scan profit</p>
                </div>
              </div>
              <div className="space-y-5">
                {(Object.keys(SCAN_LABELS) as ScanTypeKey[]).map((scanType) => {
                  const value = metrics.scanTypeProfit[scanType];
                  return (
                    <BarRow
                      key={scanType}
                      label={SCAN_LABELS[scanType]}
                      value={formatCurrency(value)}
                      percent={getPercent(value, maxScanTypeProfit)}
                      color={scanType === "standard" ? "bg-emerald-500" : scanType === "highres" ? "bg-blue-500" : "bg-amber-500"}
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border border-emerald-100 bg-emerald-50">
            <CardContent className="p-5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-700">
                <TrendingUp className="h-5 w-5" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Top Insight</p>
              <h3 className="mt-2 text-xl font-bold leading-snug text-slate-900">{topInsight}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Prints account for {formatPercent(printsPercent)} of profit, and the average order profit is{" "}
                <span className="font-semibold text-slate-900">
                  {formatCurrency(metrics.averageProfitPerOrder)}
                </span>
                .
              </p>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
