"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  CheckCircle,
  Clock,
  Film,
  Hand,
  Layers,
  Loader2,
  Mail,
  Package,
  Printer,
  Search,
} from "lucide-react";
import PublicHeader, { TRACKING_HOME_EVENT } from "@/components/PublicHeader";
import WindowFrame from "@/components/WindowFrame";
import { Input } from "@/components/ui/input";
import FilmProcessBadge from "@/components/FilmProcessBadge";
import { filmProductUrl } from "@/lib/film-product-links";
import {
  PUBLIC_ON_HOLD_MESSAGE,
  orderNoteForCustomerDisplay,
  publicTimelineStatus,
  type PublicTrackingOrder,
} from "@/lib/tracking-public";
import type { OrderStatus, StatusHistoryEntry } from "@/lib/types";
type StatusStep = {
  status: OrderStatus;
  icon: typeof Clock;
  activeBg: string;
  activeRing: string;
  activeText: string;
  activeLine: string;
};

type CommittedSearch =
  | { type: "order"; orderNumber: string; email?: string }
  | { type: "email"; email: string };

type TrackingResult = {
  customerName: string | null;
  orders: PublicTrackingOrder[];
};

const RESEND_LINK_COOLDOWN_SECONDS = 20;

const statusSteps: StatusStep[] = [
  {
    status: "Received by Yours",
    icon: Clock,
    activeBg: "bg-[#DDB1B1]",
    activeRing: "ring-[#DDB1B1]/70",
    activeText: "text-neutral-900",
    activeLine: "bg-[#DDB1B1]",
  },
  {
    status: "Received at Lab",
    icon: Package,
    activeBg: "bg-[#C5AED7]",
    activeRing: "ring-[#C5AED7]/70",
    activeText: "text-neutral-900",
    activeLine: "bg-[#C5AED7]",
  },
  {
    status: "Scans Sent",
    icon: CheckCircle,
    activeBg: "bg-[#A1CC93]",
    activeRing: "ring-[#A1CC93]/70",
    activeText: "text-neutral-900",
    activeLine: "bg-[#A1CC93]",
  },
];

const processOnlyStatusSteps: StatusStep[] = [
  statusSteps[0],
  statusSteps[1],
  {
    status: "Ready for Pickup",
    icon: Hand,
    activeBg: "bg-[#A1CC93]",
    activeRing: "ring-[#A1CC93]/70",
    activeText: "text-neutral-900",
    activeLine: "bg-[#A1CC93]",
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
      return "bg-[#DDB1B1] text-neutral-900";
    case "Received at Lab":
      return "bg-[#C5AED7] text-neutral-900";
    case "Ready for Pickup":
      return "bg-[#A1CC93] text-neutral-900";
    case "Scans Sent":
      return "bg-[#A1CC93] text-neutral-900";
    case "On Hold":
      return "bg-[#FFF6D3] text-neutral-900 ring-1 ring-neutral-900";
    default:
      return "bg-white text-neutral-900 ring-1 ring-neutral-900";
  }
}

function OrderTimeline({
  currentStatus,
  statusHistory,
  processOnly,
}: {
  currentStatus: OrderStatus | null;
  statusHistory?: StatusHistoryEntry[];
  processOnly?: boolean;
}) {
  const steps = processOnly ? processOnlyStatusSteps : statusSteps;
  const currentIndex = steps.findIndex((step) => step.status === currentStatus);
  const timestampMap = buildTimestampMap(statusHistory);

  return (
    <div className="relative mx-auto mb-8 w-full min-w-0 max-w-2xl px-0 sm:px-6">
      <div className="absolute left-[16.666%] right-[16.666%] top-[18px] z-0 flex -translate-y-1/2 sm:top-6">
        {steps.slice(0, -1).map((step, index) => (
          <div
            key={`${step.status}-line`}
            className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200"
          >
            {index < currentIndex ? (
              <div
                className={`timeline-line-fill h-full origin-left ${step.activeLine}`}
                style={{ animationDelay: `${index * 420}ms` }}
              />
            ) : null}
          </div>
        ))}
      </div>

      <div className="relative z-10 grid w-full min-w-0 grid-cols-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = index <= currentIndex;
          const isCurrent = index === currentIndex;
          const timestamp = timestampMap[step.status];

          return (
            <div key={step.status} className="flex min-w-0 flex-col items-center">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full sm:h-12 sm:w-12 ${
                  isActive ? `${step.activeBg} shadow-lg` : "bg-slate-200"
                } ${isCurrent ? `timeline-step-pulse ring-4 ${step.activeRing}` : ""}`}
              >
                <Icon
                  className={`h-4 w-4 sm:h-6 sm:w-6 ${
                    isActive ? "text-neutral-900" : "text-slate-500"
                  }`}
                />
              </div>
              <p
                className={`mt-2 max-w-[92px] text-center font-jetbrains text-xs leading-tight sm:max-w-[120px] ${
                  isActive ? `${step.activeText} font-bold` : "text-neutral-800"
                }`}
              >
                {step.status}
              </p>
              {timestamp ? (
                <p className="mt-0.5 max-w-[100px] text-center font-jetbrains text-xs leading-relaxed text-neutral-800">
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

const FILM_STOCK_PILL_CLASS =
  "rounded-full bg-white px-2 py-0.5 text-xs font-medium text-neutral-900 ring-1 ring-neutral-900";

function FilmStockPill({ stock, format }: { stock: string; format?: string | null }) {
  const href = filmProductUrl(stock, format);
  if (!href) {
    return <span className={FILM_STOCK_PILL_CLASS}>{stock}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${FILM_STOCK_PILL_CLASS} underline-offset-2 hover:underline`}
    >
      {stock}
    </a>
  );
}

const RESEND_LINK_FALLBACK =
  "If this order is ready, we'll email the download link. If you already requested one, please try again later.";

async function fetchTrackedOrders(search: CommittedSearch): Promise<TrackingResult> {
  const params = new URLSearchParams();
  if (search.type === "order") {
    params.set("order_number", search.orderNumber);
    if (search.email) params.set("email", search.email);
  } else {
    params.set("email", search.email);
  }

  const response = await fetch(`/api/orders/track?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Failed to fetch orders");
  }

  const data = await response.json();

  if (search.type === "email") {
    const customerName = typeof data.first_name === "string" && data.first_name.trim()
      ? data.first_name.trim()
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

export default function TrackingHome({ milesSaved }: { milesSaved: ReactNode }) {
  const searchParams = useSearchParams();
  const urlOrder = (searchParams.get("order") || searchParams.get("order_number") || "").trim();
  const urlEmail = (searchParams.get("email") || "").trim();
  const urlSearch: CommittedSearch | null = urlOrder
    ? { type: "order", orderNumber: urlOrder, ...(urlEmail ? { email: urlEmail } : {}) }
    : urlEmail
      ? { type: "email", email: urlEmail }
      : null;
  const [orderDraft, setOrderDraft] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [manualSearch, setManualSearch] = useState<CommittedSearch | "cleared" | null>(null);
  const [resendingOrderId, setResendingOrderId] = useState<string | null>(null);
  const [resendCooldowns, setResendCooldowns] = useState<Record<string, number>>({});
  const [resendMessages, setResendMessages] = useState<Record<string, string>>({});
  const resendInFlight = useRef(new Set<string>());
  const orderTerm = orderDraft ?? urlOrder;
  const emailTerm = emailDraft ?? urlEmail;
  const committed = manualSearch === "cleared" ? null : (manualSearch ?? urlSearch);

  const normalizedOrderTerm = orderTerm.trim();
  const normalizedEmailTerm = emailTerm.trim();
  const hasSearched = committed !== null;

  const {
    data,
    isLoading,
    isError,
  } = useQuery<TrackingResult>({
    queryKey: ["trackOrders", committed],
    queryFn: () => fetchTrackedOrders(committed as CommittedSearch),
    enabled: committed !== null,
  });

  const orders = data?.orders ?? [];
  const customerName = data?.customerName ?? null;

  useEffect(() => {
    const clearSearch = () => {
      setManualSearch("cleared");
      setOrderDraft("");
      setEmailDraft("");
    };
    window.addEventListener(TRACKING_HOME_EVENT, clearSearch);
    return () => window.removeEventListener(TRACKING_HOME_EVENT, clearSearch);
  }, []);

  useEffect(() => {
    const hasActiveCooldown = Object.values(resendCooldowns).some((seconds) => seconds > 0);
    if (!hasActiveCooldown) return;

    const timer = window.setInterval(() => {
      setResendCooldowns((current) => {
        const next: Record<string, number> = {};
        for (const [orderId, seconds] of Object.entries(current)) {
          next[orderId] = Math.max(0, seconds - 1);
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendCooldowns]);

  const handleTrackOrder = () => {
    if (!normalizedOrderTerm) return;
    setManualSearch({
      type: "order",
      orderNumber: normalizedOrderTerm,
      ...(normalizedEmailTerm ? { email: normalizedEmailTerm } : {}),
    });
  };

  const handleTrackEmail = () => {
    if (!normalizedEmailTerm) return;
    if (normalizedOrderTerm) {
      handleTrackOrder();
      return;
    }
    setManualSearch({ type: "email", email: normalizedEmailTerm });
  };

  const handleEnterKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    if (normalizedOrderTerm) {
      handleTrackOrder();
      return;
    }
    if (normalizedEmailTerm) handleTrackEmail();
  };

  const handleResendDownloadLink = async (order: PublicTrackingOrder) => {
    if (resendInFlight.current.has(order.id) || (resendCooldowns[order.id] ?? 0) > 0) return;

    resendInFlight.current.add(order.id);
    setResendingOrderId(order.id);
    setResendMessages((current) => ({ ...current, [order.id]: "" }));

    try {
      const response = await fetch("/api/resend-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderNumber: order.order_number,
        }),
      });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      setResendMessages((current) => ({
        ...current,
        [order.id]: body?.message || RESEND_LINK_FALLBACK,
      }));
      setResendCooldowns((current) => ({
        ...current,
        [order.id]: RESEND_LINK_COOLDOWN_SECONDS,
      }));
    } catch {
      setResendMessages((current) => ({
        ...current,
        [order.id]: RESEND_LINK_FALLBACK,
      }));
    } finally {
      resendInFlight.current.delete(order.id);
      setResendingOrderId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF6D3] font-jetbrains text-neutral-900">
      <PublicHeader />
      <main className="mx-auto w-full min-w-0 max-w-5xl overflow-x-clip px-4 pb-10 sm:px-6 lg:px-8">
        <WindowFrame
          title="Enter an order number or the email on the order."
          className="mb-14"
          bodyClassName="p-6 sm:p-8"
        >
            <div className="mb-4 flex flex-col gap-3">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                <Input
                  aria-label="Order number"
                  placeholder="Order number"
                  value={orderTerm}
                  onChange={(event) => setOrderDraft(event.target.value)}
                  onKeyDown={handleEnterKey}
                  className="h-12 rounded-xl border-neutral-300 bg-white pl-11 font-jetbrains text-sm text-neutral-900 shadow-none ring-0 focus-visible:border-neutral-900 focus-visible:ring-2 focus-visible:ring-[#C5AED7] sm:text-base"
                />
              </div>
              <div className="relative w-full">
                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                <Input
                  aria-label="Email address"
                  type="email"
                  placeholder="Email on the order"
                  value={emailTerm}
                  onChange={(event) => setEmailDraft(event.target.value)}
                  onKeyDown={handleEnterKey}
                  className="h-12 rounded-xl border-neutral-300 bg-white pl-11 font-jetbrains text-sm text-neutral-900 shadow-none ring-0 focus-visible:border-neutral-900 focus-visible:ring-2 focus-visible:ring-[#C5AED7] sm:text-base"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleTrackOrder}
                disabled={!normalizedOrderTerm || isLoading}
                className="flex flex-1 items-center justify-start gap-3 rounded-xl bg-[#C5AED7] px-4 py-4 text-left font-jetbrains text-sm font-bold text-neutral-900 transition-transform hover:bg-[#b79dce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 active:scale-[0.99] disabled:opacity-50 sm:justify-center sm:text-center"
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
                onClick={handleTrackEmail}
                disabled={!normalizedEmailTerm || isLoading}
                className="flex flex-1 items-center justify-start gap-3 rounded-xl bg-[#A1CC93] px-4 py-4 text-left font-jetbrains text-sm font-bold text-neutral-900 transition-transform hover:bg-[#8fbe80] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 active:scale-[0.99] disabled:opacity-50 sm:justify-center sm:text-center"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 shrink-0" />
                )}
                <span className="flex-1 sm:flex-none">Track by Email</span>
              </button>
            </div>
        </WindowFrame>

        <AnimatePresence mode="wait">
          {isLoading ? (
            <WindowFrame
              title="Looking up your order"
              className="mb-14"
              bodyClassName="flex items-center justify-center px-6 py-16"
            >
              <Loader2 className="h-8 w-8 animate-spin text-neutral-900" />
            </WindowFrame>
          ) : isError ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-14 w-full min-w-0 max-w-full"
            >
              <WindowFrame title="Search unavailable" titleAs="h3" bodyClassName="px-6 py-10 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#DDB1B1]">
                  <Film className="h-8 w-8 text-neutral-900" />
                </div>
                <p className="text-base leading-relaxed text-neutral-900">Please try again in a moment.</p>
              </WindowFrame>
            </motion.div>
          ) : hasSearched && orders.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-14 w-full min-w-0 max-w-full"
            >
              <WindowFrame title="No orders found" titleAs="h3" bodyClassName="px-6 py-10 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#C5AED7]">
                  <Film className="h-8 w-8 text-neutral-900" />
                </div>
                <p className="text-base leading-relaxed text-neutral-900">
                  {committed?.type === "email"
                    ? "No orders found for this email address"
                    : committed?.type === "order" && committed.email
                      ? "No orders found. Check the order number and email, then try again."
                      : "Order number not found. Please check and try again."}
                </p>
              </WindowFrame>
            </motion.div>
          ) : orders.length > 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex w-full min-w-0 max-w-full flex-col gap-6"
            >
              {customerName ? (
                <p className="font-jetbrains text-base font-bold text-neutral-900">
                  Showing orders for <strong>{customerName}</strong>
                </p>
              ) : null}

              <div className="flex w-full min-w-0 max-w-full flex-col gap-12">
              {orders.map((order) => {
                const processOnlyOrder = order.process_only;
                const partialProgress = order.scan_progress;
                const customerOrderNote = orderNoteForCustomerDisplay(order.notes);

                return (
                <WindowFrame
                  key={order.id}
                  title={`Order #${order.order_number}`}
                  titleAs="h2"
                  className="w-full min-w-0 max-w-full"
                  bodyClassName="p-4 sm:p-6"
                  trailing={
                    <span
                      className={`inline-flex max-w-full whitespace-nowrap rounded-full px-3 py-1 text-center font-jetbrains text-xs font-bold leading-tight sm:px-4 sm:py-1.5 sm:text-sm ${getStatusBadgeClass(
                        order.status,
                      )}`}
                    >
                      {order.status}
                    </span>
                  }
                >
                    {order.first_name ? (
                      <p className="mb-6 font-jetbrains text-lg font-bold text-neutral-900">{order.first_name}</p>
                    ) : null}

                    {order.status === "On Hold" ? (
                      <div className="mb-6 rounded-xl border-2 border-neutral-900 bg-[#FFF6D3] px-4 py-3 text-center font-jetbrains text-sm font-bold text-neutral-900">
                        {PUBLIC_ON_HOLD_MESSAGE}
                      </div>
                    ) : null}

                    <OrderTimeline
                      currentStatus={publicTimelineStatus(order)}
                      statusHistory={order.status_history}
                      processOnly={processOnlyOrder}
                    />

                    {partialProgress.length > 0 && order.status !== "Scans Sent" ? (
                      <div className="mt-6 rounded-xl border-2 border-neutral-900 bg-[#C5AED7]/30 px-4 py-3 text-base leading-relaxed text-neutral-900">
                        <p className="mb-2 font-jetbrains font-bold">Scan delivery progress</p>
                        <ul className="space-y-1.5">
                          {partialProgress.map((item) => (
                            <li key={item.batch}>
                              {item.delivered ? (
                                <span>
                                  <strong>{item.batch === "Color" ? "Color scans" : "B&W scans"} sent</strong>
                                  {item.deliveredAt
                                    ? ` — ${format(new Date(item.deliveredAt), "MMM d")}`
                                    : ""}
                                  . Download link was emailed to you.
                                </span>
                              ) : (
                                <span>
                                  <strong>{item.batch === "Color" ? "Color scans" : "B&W scans"}</strong> still being processed
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#DDB1B1]">
                          <Calendar className="h-5 w-5 text-neutral-900" />
                        </div>
                        <div>
                          <p className="font-jetbrains text-xs font-bold text-neutral-900">Dropped off</p>
                          <p className="text-base leading-relaxed text-neutral-900">
                            {format(new Date(order.dropoff_date), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#A1CC93]">
                          <Layers className="h-5 w-5 text-neutral-900" />
                        </div>
                        <div>
                          <p className="font-jetbrains text-xs font-bold text-neutral-900">Number of rolls</p>
                          <p className="text-base leading-relaxed text-neutral-900">
                            {order.roll_count} roll{order.roll_count > 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                    {order.roll_details && order.roll_details.length > 0 ? (
                      <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                        <p className="font-jetbrains text-xs font-bold uppercase tracking-wide text-neutral-900">
                          Film Details
                        </p>
                        {order.roll_details.map((roll, index) => (
                          <div
                            key={`${order.id}-roll-${index}`}
                            className="flex flex-wrap items-center gap-2 text-sm"
                          >
                            <span className="min-w-[44px] text-base leading-relaxed text-neutral-900">
                              Roll {index + 1}
                            </span>
                            <span className="rounded-full bg-[#FFF6D3] px-2 py-0.5 text-xs font-bold text-neutral-900">
                              {roll.film_type}
                            </span>
                            <FilmProcessBadge
                              process={roll.film_process}
                              className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
                            />
                            {roll.scan_size ? (
                              <span className="rounded-full bg-[#C5AED7] px-2 py-0.5 text-xs font-bold text-neutral-900">
                                {roll.scan_size}
                              </span>
                            ) : null}
                            {roll.film_stock ? (
                              <FilmStockPill stock={roll.film_stock} format={roll.film_type} />
                            ) : null}
                            {roll.prints_4x6 ? (
                              <span className="flex items-center gap-1 rounded-full bg-[#A1CC93] px-2 py-0.5 text-xs font-bold text-neutral-900">
                                <Printer className="h-3 w-3" />
                                4x6 Prints
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : order.film_type || order.film_process ? (
                      <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                        <p className="font-jetbrains text-xs font-bold uppercase tracking-wide text-neutral-900">
                          Film Details
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {order.film_type ? (
                            <span className="rounded-full bg-[#FFF6D3] px-2 py-0.5 text-xs font-bold text-neutral-900">
                              {order.film_type}
                            </span>
                          ) : null}
                          {order.film_process ? (
                            <FilmProcessBadge
                              process={order.film_process}
                              className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
                            />
                          ) : null}
                          {order.film_stock ? (
                            <FilmStockPill stock={order.film_stock} format={order.film_type} />
                          ) : null}
                          {order.prints_4x6 ? (
                            <span className="flex items-center gap-1 rounded-full bg-[#A1CC93] px-2 py-0.5 text-xs font-bold text-neutral-900">
                              <Printer className="h-3 w-3" />
                              4x6 Prints
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {customerOrderNote ? (
                      <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                        <p className="font-jetbrains text-xs font-bold uppercase tracking-wide text-neutral-900">
                          Order notes
                        </p>
                        <p className="whitespace-pre-wrap text-base leading-relaxed text-neutral-900">
                          {customerOrderNote}
                        </p>
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
                            className="flex items-center justify-center gap-2 rounded-xl bg-[#C5AED7] px-4 py-3 font-jetbrains text-sm font-bold text-neutral-900 transition-colors hover:bg-[#b79dce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
                          >
                            <Printer className="h-5 w-5" />
                            Want to add prints?
                          </a>
                        </div>
                      ) : null;
                    })()}

                    {order.status === "Ready for Pickup" && processOnlyOrder ? (
                      <div className="mt-4 rounded-xl border-2 border-neutral-900 bg-[#FFF6D3] px-4 py-3 text-center font-jetbrains text-sm font-bold text-neutral-900">
                        Your negatives are ready. No scans are included with this order. Please check your email for pickup or delivery details.
                      </div>
                    ) : null}

                    {order.status === "Scans Sent" ? (
                      <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                        <div className="rounded-xl bg-[#A1CC93]/40 px-4 py-3 text-center font-jetbrains text-sm font-bold text-neutral-900">
                          Your download link was sent to your email
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResendDownloadLink(order)}
                          disabled={
                            resendingOrderId === order.id ||
                            (resendCooldowns[order.id] ?? 0) > 0
                          }
                          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-neutral-900 bg-white px-4 py-3 font-jetbrains text-sm font-bold text-neutral-900 transition-colors hover:bg-[#FFF6D3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {resendingOrderId === order.id ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Mail className="h-5 w-5" />
                          )}
                          {(resendCooldowns[order.id] ?? 0) > 0
                            ? `Resend in ${resendCooldowns[order.id]}s`
                            : "Resend Download Link"}
                        </button>
                        {resendMessages[order.id] ? (
                          <p
                            className="text-center text-base leading-relaxed text-neutral-900"
                          >
                            {resendMessages[order.id]}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <a
                        href={`mailto:hello@yoursdurham.com?subject=Order%20%23${order.order_number}`}
                        className="flex items-center justify-center gap-2 rounded-xl bg-[#A1CC93] px-4 py-3 font-jetbrains text-sm font-bold text-neutral-900 transition-colors hover:bg-[#8fbe80] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
                      >
                        <Mail className="h-5 w-5" />
                        Questions about this order?
                      </a>
                    </div>
                </WindowFrame>
                );
              })}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {hasSearched ? null : milesSaved}

        <div className="mb-10 mt-12">
          <h2 className="mb-8 text-center font-jetbrains text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            Explore Our Services
          </h2>
          <div className="grid w-full min-w-0 grid-cols-1 gap-6 md:grid-cols-3">
            <a
              href="https://www.yoursdurham.com/develop"
              target="_blank"
              rel="noopener noreferrer"
              className="block min-w-0 rounded-[1.7rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFF6D3]"
            >
              <WindowFrame
                title="Film Developing"
                titleAs="h3"
                className="h-full transition hover:-translate-y-0.5"
                bodyClassName="p-7 sm:p-8"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#A1CC93]">
                  <Package className="h-6 w-6 text-neutral-900" />
                </div>
                <p className="text-base leading-relaxed text-neutral-900">
                  Professional film developing services for all your analog photography needs
                </p>
              </WindowFrame>
            </a>

            <a
              href="https://www.yoursdurham.com/shop-now"
              target="_blank"
              rel="noopener noreferrer"
              className="block min-w-0 rounded-[1.7rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFF6D3]"
            >
              <WindowFrame
                title="Shop Film"
                titleAs="h3"
                className="h-full transition hover:-translate-y-0.5"
                bodyClassName="p-7 sm:p-8"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#C5AED7]">
                  <Film className="h-6 w-6 text-neutral-900" />
                </div>
                <p className="text-base leading-relaxed text-neutral-900">
                  Browse our selection of premium film stock and photography supplies
                </p>
              </WindowFrame>
            </a>

            <a
              href="mailto:hello@yoursdurham.com"
              className="block min-w-0 rounded-[1.7rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFF6D3]"
            >
              <WindowFrame
                title="Need help?"
                titleAs="h3"
                className="h-full transition hover:-translate-y-0.5"
                bodyClassName="p-7 sm:p-8"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#DDB1B1]">
                  <Mail className="h-6 w-6 text-neutral-900" />
                </div>
                <p className="text-base leading-relaxed text-neutral-900">Click here to send us an email!</p>
              </WindowFrame>
            </a>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 px-1 text-left text-base leading-relaxed text-neutral-900 sm:px-0 sm:text-center">
          <span className="font-semibold tracking-wide">INFO:</span>
          <a
            href="https://www.yoursdurham.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold underline underline-offset-2 hover:no-underline"
          >
            Yours, Durham
          </a>
          <a
            href="https://maps.apple/p/3E3GveJFzj_71S"
            className="underline underline-offset-2 hover:no-underline"
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
