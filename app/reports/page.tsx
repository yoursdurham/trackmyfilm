"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, LogOut, Users, Film, Layers } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { FilmOrder } from "@/lib/types";

interface ReportMetrics {
  totalCustomers: number;
  totalBWRolls: number;
  totalColorRolls: number;
  total35mmRolls: number;
  total120Rolls: number;
  total4x6Prints: number;
  filmStockUsage: { stock: string; count: number }[];
  scanResolutionUsage: { resolution: string; count: number }[];
}

type TimeFrameKey = "all" | "7d" | "30d" | "90d" | "365d";

const TIME_FRAMES: { key: TimeFrameKey; label: string; days?: number }[] = [
  { key: "all", label: "All time" },
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "365d", label: "Last 12 months", days: 365 },
];

export default function Reports() {
  const [selectedTimeFrame, setSelectedTimeFrame] = useState<TimeFrameKey>("all");

  const { data: orders = [] } = useQuery<FilmOrder[]>({
    queryKey: ["filmOrders"],
    queryFn: async () => {
      const r = await fetch("/api/orders");
      if (!r.ok) throw new Error("Failed to fetch orders");
      return r.json();
    },
  });

  const getDateForOrder = (order: FilmOrder) => {
    if (order.created_at) return new Date(order.created_at);
    return new Date(order.dropoff_date);
  };

  const filteredOrders = orders.filter((order) => {
    if (selectedTimeFrame === "all") return true;
    const timeFrame = TIME_FRAMES.find((frame) => frame.key === selectedTimeFrame);
    if (!timeFrame?.days) return true;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - timeFrame.days);
    const orderDate = getDateForOrder(order);
    return orderDate >= cutoff;
  });

  const calculateMetrics = (orderList: FilmOrder[] = orders): ReportMetrics => {
    const uniqueCustomerIds = new Set<string>();
    const filmStockMap = new Map<string, number>();
    const scanResolutionMap = new Map<string, number>();
    let totalBWRolls = 0;
    let totalColorRolls = 0;
    let total35mmRolls = 0;
    let total120Rolls = 0;
    let total4x6Prints = 0;

    orderList.forEach((order) => {
      uniqueCustomerIds.add(order.customer_id);

      if (order.roll_details && order.roll_details.length > 0) {
        order.roll_details.forEach((roll) => {
          if (roll.film_process === "Black & White") totalBWRolls++;
          if (roll.film_process === "Color") totalColorRolls++;
          if (roll.film_type === "35mm") total35mmRolls++;
          if (roll.film_type === "120") total120Rolls++;
          if (roll.prints_4x6) total4x6Prints++;
          if (roll.film_stock) {
            filmStockMap.set(roll.film_stock, (filmStockMap.get(roll.film_stock) || 0) + 1);
          }
          if (roll.scan_size) {
            scanResolutionMap.set(roll.scan_size, (scanResolutionMap.get(roll.scan_size) || 0) + 1);
          }
        });
      } else {
        // Fallback to legacy single film type/process
        if (order.film_process === "Black & White") totalBWRolls += order.roll_count;
        if (order.film_process === "Color") totalColorRolls += order.roll_count;
        if (order.film_type === "35mm") total35mmRolls += order.roll_count;
        if (order.film_type === "120") total120Rolls += order.roll_count;
        if (order.prints_4x6) total4x6Prints += order.roll_count;
        if (order.film_stock) {
          filmStockMap.set(order.film_stock, (filmStockMap.get(order.film_stock) || 0) + order.roll_count);
        }
      }
    });

    const filmStockUsage = Array.from(filmStockMap.entries())
      .map(([stock, count]) => ({ stock, count }))
      .sort((a, b) => b.count - a.count);

    const scanResolutionUsage = Array.from(scanResolutionMap.entries())
      .map(([resolution, count]) => ({ resolution, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalCustomers: uniqueCustomerIds.size,
      totalBWRolls,
      totalColorRolls,
      total35mmRolls,
      total120Rolls,
      total4x6Prints,
      filmStockUsage,
      scanResolutionUsage,
    };
  };

  const metrics = calculateMetrics(filteredOrders);

  const filmProcessData = [
    { name: "Color", value: metrics.totalColorRolls, fill: "#F59E0B" },
    { name: "B/W", value: metrics.totalBWRolls, fill: "#6B7280" },
  ];

  const scanResolutionData = metrics.scanResolutionUsage.map((item, index) => ({
    name: item.resolution,
    value: item.count,
    fill: ["#3B82F6", "#10B981", "#F59E0B"][index % 3], // Cycle through colors
  }));

  const handleExport = () => {
    const reportData = {
      generatedAt: new Date().toISOString(),
      metrics,
    };

    const csvContent = [
      "TrackMyFilm Report",
      `Generated: ${new Date().toLocaleString()}`,
      `Time frame: ${TIME_FRAMES.find((frame) => frame.key === selectedTimeFrame)?.label ?? "All time"}`,
      "",
      "METRICS",
      `Total Individual Customers,${metrics.totalCustomers}`,
      `Total B/W Rolls,${metrics.totalBWRolls}`,
      `Total Color Rolls,${metrics.totalColorRolls}`,
      `Total 35mm Rolls,${metrics.total35mmRolls}`,
      `Total 120 Rolls,${metrics.total120Rolls}`,
      `Total 4x6" Prints Done,${metrics.total4x6Prints}`,
      "",
      "FILM STOCK USAGE",
      "Film Stock,Count",
      ...metrics.filmStockUsage.map((fs) => `${fs.stock},${fs.count}`),
      "",
      "SCAN RESOLUTION USAGE",
      "Resolution,Count",
      ...metrics.scanResolutionUsage.map((sr) => `${sr.resolution},${sr.count}`),
    ].join("\n");

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
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-stone-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Yours Durham" className="w-9 h-9 rounded-xl object-cover" />
              <div>
                <h1 className="text-lg font-semibold text-slate-800">Reports</h1>
                <p className="text-xs text-slate-500 hidden sm:block">Film Lab Analytics</p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <Link href="/dashboard">
                <Button variant="outline" size="icon" className="border-slate-200 sm:w-auto sm:px-3" title="Dashboard">
                  <Film className="w-4 h-4" />
                  <span className="hidden sm:inline ml-2">Dashboard</span>
                </Button>
              </Link>
              <form action="/api/auth/logout" method="POST">
                <Button type="submit" variant="ghost" size="icon" title="Sign out" className="text-slate-500 hover:text-slate-700">
                  <LogOut className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Analytics Dashboard</h2>
            <p className="text-sm text-slate-500">Showing data for <span className="font-semibold text-slate-700">{TIME_FRAMES.find((frame) => frame.key === selectedTimeFrame)?.label}</span></p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-2">
              {TIME_FRAMES.map((frame) => (
                <button
                  key={frame.key}
                  type="button"
                  onClick={() => setSelectedTimeFrame(frame.key)}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${selectedTimeFrame === frame.key ? "border-amber-500 bg-amber-500 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
                >
                  {frame.label}
                </button>
              ))}
            </div>
            <Button onClick={handleExport} className="bg-amber-600 hover:bg-amber-700 text-white">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
                  <p className="text-xs text-slate-500 uppercase tracking-wide">4x6" Prints</p>
                  <p className="text-3xl font-bold text-purple-600">{metrics.total4x6Prints}</p>
                </div>
                <Layers className="w-8 h-8 text-purple-500 opacity-20" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Film Type Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
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
                <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between font-semibold">
                  <span className="text-slate-700">Total Rolls</span>
                  <span className="text-2xl text-slate-800">
                    {metrics.total35mmRolls + metrics.total120Rolls}
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
                  <span className="text-sm text-slate-600">Color</span>
                  <span className="text-2xl font-bold text-amber-600">{metrics.totalColorRolls}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Black & White</span>
                  <span className="text-2xl font-bold text-gray-600">{metrics.totalBWRolls}</span>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between font-semibold">
                  <span className="text-slate-700">Total Rolls</span>
                  <span className="text-2xl text-slate-800">{metrics.totalColorRolls + metrics.totalBWRolls}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border border-stone-100">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Film Process Breakdown</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={filmProcessData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {filmProcessData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border border-stone-100">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Scan Resolution Breakdown</h3>
              {scanResolutionData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={scanResolutionData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {scanResolutionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-slate-500">No scan resolution data available</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Film Stock Usage */}
        <Card className="border border-stone-100 mt-6">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Film Stock Usage</h3>
            {metrics.filmStockUsage.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200">
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">Film Stock</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">Times Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.filmStockUsage.map((item, index) => (
                      <tr key={index} className="border-b border-stone-100 hover:bg-stone-50">
                        <td className="py-3 px-3 text-slate-700">{item.stock}</td>
                        <td className="text-right py-3 px-3 font-medium text-slate-800">{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-slate-500">No film stock data available</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
