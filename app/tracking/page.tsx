"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  CheckCircle,
  Clock,
  Download,
  ExternalLink,
  Film,
  Layers,
  Loader2,
  Mail,
  Package,
  Printer,
  Search,
} from "lucide-react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { FilmOrder, OrderStatus, StatusHistoryEntry } from "@/lib/types";

type StatusStep = {
  status: OrderStatus;
  icon: typeof Clock;
  activeBg: string;
  activeRing: string;
  activeText: string;
  activeLine: string;
};

type CommittedSearch = {
  term: string;
  type: "order" | "email";
};

type TrackingResult = {
  customerName: string | null;
  orders: FilmOrder[];
};

const statusSteps: StatusStep[] = [
  {
    status: "Received by Yours",
    icon: Clock,
    activeBg: "bg-[var(--accent-tan)]",
    activeRing: "ring-[var(--accent-tan)]/35",
    activeText: "text-[#A77B43]",
    activeLine: "bg-[var(--accent-tan)]",
  },
  {
    status: "Received at Lab",
    icon: Package,
    activeBg: "bg-[var(--accent-purple)]",
    activeRing: "ring-[var(--accent-purple)]/35",
    activeText: "text-[#806A91]",
    activeLine: "bg-[var(--accent-purple)]",
  },
  {
    status: "Scans Sent",
    icon: CheckCircle,
    activeBg: "bg-[var(--accent-green)]",
    activeRing: "ring-[var(--accent-green)]/35",
    activeText: "text-[#5E8068]",
    activeLine: "bg-[var(--accent-green)]",
  },
];

function buildTimestampMap(statusHistory?: StatusHistoryEntry[]) {
  if (!statusHistory?.length) return {};

  return Object.fromEntries(
    [...statusHistory].reverse().map((entry) => [
      entry.status,
      format(new Date(entry.changed_at), "MMM d, h:mm a"),
    ])
  );
}

function getStatusBadgeClass(status: OrderStatus) {
  switch (status) {
    case "Received by Yours":
      return "bg-[var(--accent-tan)] text-[#A77B43]";
    case "Received at Lab":
      return "bg-[var(--accent-purple)] text-white";
    case "Scans Sent":
      return "bg-[var(--accent-green)] text-white";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function OrderTimeline({
  currentStatus,
  statusHistory,
}: {
  currentStatus: OrderStatus;
  statusHistory?: StatusHistoryEntry[];
}) {
  const currentIndex = statusSteps.findIndex((step) => step.status === currentStatus);
  const timestampMap = buildTimestampMap(statusHistory);

  return (
    <div className="relative mx-auto mb-8 max-w-2xl px-2 sm:px-6">
      <div className="absolute left-[16.666%] right-[16.666%] top-[18px] z-0 flex -translate-y-1/2 sm:top-6">
        {statusSteps.slice(0, -1).map((step, index) => (
          <div
            key={`${step.status}-line`}
            className={`h-1 flex-1 rounded-full transition-all ${
              index < currentIndex ? step.activeLine : "bg-slate-200"
            }`}
          />
        ))}
      </div>

      <div className="relative z-10 grid grid-cols-3">
        {statusSteps.map((step, index) => {
          const Icon = step.icon;
          const isActive = index <= currentIndex;
          const isCurrent = index === currentIndex;
          const timestamp = timestampMap[step.status];

          return (
            <div key={step.status} className="flex min-w-0 flex-col items-center">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-all sm:h-12 sm:w-12 ${
                  isActive ? `${step.activeBg} shadow-lg` : "bg-slate-200"
                } ${isCurrent ? `ring-4 ${step.activeRing}` : ""}`}
              >
                <Icon
                  className={`h-4 w-4 sm:h-6 sm:w-6 ${
                    isActive ? "text-white" : "text-slate-400"
                  }`}
                />
              </div>
              <p
                className={`mt-2 max-w-[92px] text-center text-xs leading-tight sm:max-w-[120px] ${
                  isActive ? `${step.activeText} font-medium` : "text-slate-400"
                }`}
              >
                {step.status}
              </p>
              {timestamp ? (
                <p className="mt-0.5 max-w-[100px] text-center text-xs text-slate-400">
                  {timestamp}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

async function fetchTrackedOrders(search: CommittedSearch): Promise<TrackingResult> {
  const param =
    search.type === "order"
      ? `order_number=${encodeURIComponent(search.term)}`
      : `email=${encodeURIComponent(search.term)}`;

  const response = await fetch(`/api/orders/track?${param}`);
  if (!response.ok) {
    throw new Error("Failed to fetch orders");
  }

  const data = await response.json();

  if (search.type === "email") {
    const customerName = data.customer
      ? `${data.customer.name} ${data.customer.last_name ?? ""}`.trim()
      : null;

    return {
      customerName,
      orders: Array.isArray(data.orders) ? data.orders : [],
    };
  }

  return {
    customerName: null,
    orders: Array.isArray(data) ? data : [],
  };
}

export default function Tracking() {
  const [searchTerm, setSearchTerm] = useState("");
  const [committed, setCommitted] = useState<CommittedSearch | null>(null);

  const normalizedSearchTerm = searchTerm.trim();
  const hasSearched = committed !== null;

  const {
    data,
    isLoading,
    isError,
  } = useQuery<TrackingResult>({
    queryKey: ["trackOrders", committed?.term, committed?.type],
    queryFn: () => fetchTrackedOrders(committed as CommittedSearch),
    enabled: committed !== null,
  });

  const orders = data?.orders ?? [];
  const customerName = data?.customerName ?? null;

  const handleSearch = (type: "order" | "email") => {
    if (!normalizedSearchTerm) return;
    setCommitted({ term: normalizedSearchTerm, type });
  };

  const handleEnterKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || !normalizedSearchTerm) return;
    handleSearch(normalizedSearchTerm.includes("@") ? "email" : "order");
  };

  const handleReset = () => {
    setSearchTerm("");
    setCommitted(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-[#F7F3EC]">
        <div className="mx-auto max-w-5xl px-4 pb-10 pt-10 text-center sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={handleReset}
            aria-label="Reset tracking search"
            className="mx-auto mb-4 block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-purple)] focus-visible:ring-offset-2"
          >
            <Image
              src="/logo.png"
              alt="Yours Durham"
              width={48}
              height={48}
              className="h-12 w-12 rounded-xl"
            />
          </button>
          <h1 className="text-sm font-semibold tracking-tight text-slate-900 sm:text-xl sm:whitespace-nowrap">
            Track My Film
            <span className="ml-1 font-normal text-slate-500 sm:ml-2">
              - A Project by Yours, Durham
            </span>
          </h1>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-10 sm:px-6 lg:px-8">
        <Card className="mb-14 rounded-[24px] border border-[var(--border-soft)] bg-[var(--card-bg)] shadow-sm ring-0">
          <CardContent className="p-6 sm:p-8">
            <div className="relative mb-4 w-full">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Enter order number or email..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={handleEnterKey}
                className="h-12 rounded-xl border-[#E1DDD6] bg-[var(--card-bg)] pl-11 text-sm shadow-none ring-0 focus-visible:border-[#B19FBF] focus-visible:ring-2 focus-visible:ring-[#B19FBF]/20 sm:text-base"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => handleSearch("order")}
                disabled={!normalizedSearchTerm || isLoading}
                className="flex flex-1 items-center justify-start gap-3 rounded-xl bg-[#B19FBF] px-4 py-4 text-left text-white transition-transform active:scale-[0.99] disabled:opacity-50 sm:justify-center sm:text-center"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 shrink-0" />
                )}
                <span className="flex-1 sm:flex-none">Track by Order #</span>
              </button>

              <button
                type="button"
                onClick={() => handleSearch("email")}
                disabled={!normalizedSearchTerm || isLoading}
                className="flex flex-1 items-center justify-start gap-3 rounded-xl bg-[#B19FBF] px-4 py-4 text-left text-white transition-transform active:scale-[0.99] disabled:opacity-50 sm:justify-center sm:text-center"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 shrink-0" />
                )}
                <span className="flex-1 sm:flex-none">Track by Email</span>
              </button>
            </div>
          </CardContent>
        </Card>

        <AnimatePresence mode="wait">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#C9A34B]" />
            </div>
          ) : isError ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="py-20 text-center"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
                <Film className="h-8 w-8 text-red-300" />
              </div>
              <h3 className="mb-1 text-lg font-medium text-slate-700">Search unavailable</h3>
              <p className="text-slate-500">Please try again in a moment.</p>
            </motion.div>
          ) : hasSearched && orders.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="py-20 text-center"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                <Film className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="mb-1 text-lg font-medium text-slate-700">No orders found</h3>
              <p className="text-slate-500">
                {committed?.type === "email"
                  ? "No orders found for this email address"
                  : "Order number not found. Please check and try again."}
              </p>
            </motion.div>
          ) : orders.length > 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {customerName ? (
                <p className="font-medium text-slate-600">
                  Showing orders for <strong>{customerName}</strong>
                </p>
              ) : null}

              {orders.map((order) => (
                <Card
                  key={order.id}
                  className="overflow-hidden border border-[var(--border-soft)] bg-[var(--card-bg)] shadow-sm ring-0 transition hover:shadow-md"
                >
                  <CardContent className="p-6">
                    <div className="mb-6 flex items-start justify-between gap-4">
                      <div>
                        <h2 className="mb-1 text-xl font-bold text-slate-800">
                          Order #{order.order_number}
                        </h2>
                        <p className="text-slate-600">{order.customer_name}</p>
                      </div>
                      <div
                        className={`rounded-full px-4 py-2 text-sm font-medium ${getStatusBadgeClass(
                          order.status
                        )}`}
                      >
                        {order.status}
                      </div>
                    </div>

                    <OrderTimeline
                      currentStatus={order.status}
                      statusHistory={order.status_history}
                    />

                    <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                          <Calendar className="h-5 w-5 text-slate-600" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Dropped off</p>
                          <p className="text-sm font-medium text-slate-800">
                            {format(new Date(order.dropoff_date), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                          <Layers className="h-5 w-5 text-slate-600" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Number of rolls</p>
                          <p className="text-sm font-medium text-slate-800">
                            {order.roll_count} roll{order.roll_count > 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                    {order.roll_details && order.roll_details.length > 0 ? (
                      <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Film Details
                        </p>
                        {order.roll_details.map((roll, index) => (
                          <div
                            key={`${order.id}-roll-${index}`}
                            className="flex flex-wrap items-center gap-2 text-sm"
                          >
                            <span className="min-w-[44px] font-medium text-slate-600">
                              Roll {index + 1}
                            </span>
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                              {roll.film_type}
                            </span>
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                              {roll.film_process}
                            </span>
                            {roll.scan_size ? (
                              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                                {roll.scan_size}
                              </span>
                            ) : null}
                            {roll.film_stock ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                {roll.film_stock}
                              </span>
                            ) : null}
                            {roll.prints_4x6 ? (
                              <span className="flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                                <Printer className="h-3 w-3" />
                                4x6 Prints
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : order.film_type || order.film_process ? (
                      <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Film Details
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {order.film_type ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                              {order.film_type}
                            </span>
                          ) : null}
                          {order.film_process ? (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                              {order.film_process}
                            </span>
                          ) : null}
                          {order.film_stock ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                              {order.film_stock}
                            </span>
                          ) : null}
                          {order.prints_4x6 ? (
                            <span className="flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                              <Printer className="h-3 w-3" />
                              4x6 Prints
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {(() => {
                      const hasPrints = order.roll_details?.some(roll => roll.prints_4x6) || order.prints_4x6;
                      return !hasPrints ? (
                        <div className="mt-4 border-t border-slate-100 pt-4">
                          <a
                            href="https://www.yoursdurham.com/filmdev/4x6-prints"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 rounded-lg bg-[var(--accent-purple)] px-4 py-3 font-medium text-white shadow-md transition-all hover:bg-[#6f5a94] hover:shadow-lg"
                          >
                            <Printer className="h-5 w-5" />
                            Want to add prints?
                          </a>
                        </div>
                      ) : null;
                    })()}

                    {order.status === "Scans Sent" && order.wetransfer_link ? (
                      <div className="mt-4 border-t border-slate-100 pt-4">
                        <a
                          href={order.wetransfer_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 rounded-lg bg-[var(--accent-green)] px-4 py-3 font-medium text-white shadow-md transition-all hover:bg-[#7D9E88] hover:shadow-lg"
                        >
                          <Download className="h-5 w-5" />
                          Download Your Scans
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    ) : null}

                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <a
                        href={`mailto:hello@yoursdurham.com?subject=Order%20%23${order.order_number}`}
                        className="flex items-center justify-center gap-2 rounded-lg bg-[var(--accent-green)] px-4 py-3 font-medium text-white shadow-md transition-all hover:bg-[#7D9E88] hover:shadow-lg"
                      >
                        <Mail className="h-5 w-5" />
                        Questions about this order?
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="mb-10 mt-12">
          <h2 className="mb-8 text-center text-2xl font-bold text-slate-800 sm:text-3xl">
            Explore Our Services
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <a href="https://www.yoursdurham.com/develop" target="_blank" rel="noopener noreferrer">
              <Card className="h-full cursor-pointer border border-[var(--border-soft)] bg-[var(--card-bg)] shadow-sm ring-0 transition hover:-translate-y-0.5 hover:shadow-md">
                <CardContent className="p-7 sm:p-8">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--accent-tan)]">
                    <Package className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-800">Film Developing</h3>
                  <p className="text-slate-600">
                    Professional film developing services for all your analog photography needs
                  </p>
                </CardContent>
              </Card>
            </a>

            <a href="https://www.yoursdurham.com/shop-now" target="_blank" rel="noopener noreferrer">
              <Card className="h-full cursor-pointer border border-[var(--border-soft)] bg-[var(--card-bg)] shadow-sm ring-0 transition hover:-translate-y-0.5 hover:shadow-md">
                <CardContent className="p-7 sm:p-8">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--accent-purple)]">
                    <Film className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-800">Shop Film</h3>
                  <p className="text-slate-600">
                    Browse our selection of premium film stock and photography supplies
                  </p>
                </CardContent>
              </Card>
            </a>

            <a href="mailto:hello@yoursdurham.com">
              <Card className="h-full cursor-pointer border border-[var(--border-soft)] bg-[var(--card-bg)] shadow-sm ring-0 transition hover:-translate-y-0.5 hover:shadow-md">
                <CardContent className="p-7 sm:p-8">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--accent-green)]">
                    <Mail className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-800">Need help?</h3>
                  <p className="text-slate-600">Click here to send us an email!</p>
                </CardContent>
              </Card>
            </a>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 px-1 text-left text-sm leading-relaxed text-slate-600 sm:px-0 sm:text-center">
          <span className="font-semibold tracking-wide text-[#24324A]">INFO:</span>
          <a
            href="https://www.yoursdurham.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-[#24324A] underline underline-offset-2 hover:no-underline"
          >
            Yours, Durham
          </a>
          <a
            href="https://maps.apple/p/3E3GveJFzj_71S"
            className="text-[#24324A] underline underline-offset-2 hover:no-underline"
          >
            209 N. Gregson St. Durham, NC 27701
          </a>
          <span>Retail Hours: Thursdays 5-7PM & Saturdays 11-2PM</span>
          <span>Film Drop Box - 24/7</span>
        </div>
      </main>
    </div>
  );
}
