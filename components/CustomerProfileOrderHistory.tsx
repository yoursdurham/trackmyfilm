"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Calendar, ChevronDown, Layers } from "lucide-react";
import OrderDetailsReadOnly from "@/components/OrderDetailsReadOnly";
import { ORDER_STATUS } from "@/lib/constants";
import { orderProcessSummary } from "@/lib/customer-preference-calculations";
import { staffOrderDetailPath } from "@/lib/staff-navigation";
import type { FilmOrder } from "@/lib/types";

const DESKTOP_GRID =
  "md:grid md:grid-cols-[minmax(7.25rem,1.05fr)_minmax(9rem,1.2fr)_minmax(5.75rem,0.9fr)_minmax(8.25rem,1fr)_minmax(4.5rem,0.7fr)_2rem] md:items-center md:gap-x-3";

function statusClass(status: string) {
  if (status === ORDER_STATUS.RECEIVED_BY_YOURS) return "bg-[var(--accent-tan)] text-[#A77B43]";
  if (status === ORDER_STATUS.RECEIVED_AT_LAB) return "bg-[var(--accent-green)] text-white";
  if (status === ORDER_STATUS.READY_FOR_PICKUP) return "bg-amber-500 text-white";
  return "bg-[var(--accent-purple)] text-white";
}

type Props = {
  orders: FilmOrder[];
};

export default function CustomerProfileOrderHistory({ orders }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (orders.length === 0) {
    return <p className="text-sm italic text-slate-400">No orders on record yet.</p>;
  }

  return (
    <div className="mt-1 space-y-2">
      <div
        className={`mb-0.5 hidden px-4 ${DESKTOP_GRID} text-[10px] font-medium uppercase tracking-wider text-slate-400`}
        aria-hidden
      >
        <span>Order</span>
        <span>Status</span>
        <span>Rolls</span>
        <span>Date</span>
        <span>Process</span>
        <span />
      </div>

      {orders.map((order) => {
        const expanded = expandedId === order.id;
        const processSummary = orderProcessSummary(order);
        const rollLabel = `${order.roll_count} roll${order.roll_count !== 1 ? "s" : ""}`;
        const dateLabel = order.dropoff_date
          ? format(new Date(order.dropoff_date), "MMM d, yyyy")
          : "—";

        const toggle = () => setExpandedId(expanded ? null : order.id);
        const orderHref = staffOrderDetailPath(order.id);

        return (
          <div
            key={order.id}
            className={`overflow-hidden rounded-lg border bg-white transition-shadow ${
              expanded
                ? "border-amber-200/80 shadow-sm ring-1 ring-amber-100"
                : "border-stone-200 hover:border-stone-300 hover:shadow-sm"
            }`}
          >
            <div className={`hidden min-h-[52px] px-4 py-3 ${DESKTOP_GRID}`}>
              <Link
                href={orderHref}
                className="min-w-0 truncate font-mono text-sm font-semibold text-amber-700 hover:underline"
                title={`Open order ${order.order_number}`}
              >
                #{order.order_number}
              </Link>
              <button
                type="button"
                className="col-span-5 grid cursor-pointer grid-cols-subgrid items-center border-0 bg-transparent p-0 text-left"
                aria-label={`Show details for order ${order.order_number}`}
                onClick={toggle}
                aria-expanded={expanded}
              >
                <span
                  className={`inline-flex w-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-medium leading-snug ${statusClass(order.status)}`}
                >
                  {order.status}
                </span>
                <span className="flex items-center gap-1.5 whitespace-nowrap text-slate-600">
                  <Layers className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  {rollLabel}
                </span>
                <span className="flex items-center gap-1.5 whitespace-nowrap text-slate-600">
                  <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  {dateLabel}
                </span>
                <span className="whitespace-nowrap text-slate-600">{processSummary || "—"}</span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 justify-self-end text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </button>
            </div>

            <div className="px-4 py-3 md:hidden">
              <div className="flex w-full items-center justify-between gap-3">
                <Link
                  href={orderHref}
                  className="min-w-0 font-mono text-base font-semibold text-amber-700 hover:underline"
                  title={`Open order ${order.order_number}`}
                >
                  #{order.order_number}
                </Link>
                <button
                  type="button"
                  className="flex min-h-11 flex-1 cursor-pointer items-center justify-end gap-3 border-0 bg-transparent p-0 text-left"
                  aria-label={`Show details for order ${order.order_number}`}
                  onClick={toggle}
                  aria-expanded={expanded}
                >
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(order.status)}`}>
                    {order.status}
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>
              </div>
              <button
                type="button"
                className="mt-2 w-full cursor-pointer border-0 bg-transparent p-0 text-left text-sm leading-relaxed text-slate-500"
                onClick={toggle}
              >
                <span className="inline-flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                  {rollLabel}
                </span>
                <span className="mx-2 text-slate-300" aria-hidden>
                  ·
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                  {dateLabel}
                </span>
                {processSummary ? (
                  <>
                    <span className="mx-2 text-slate-300" aria-hidden>
                      ·
                    </span>
                    <span className="text-slate-600">{processSummary}</span>
                  </>
                ) : null}
              </button>
            </div>

            {expanded ? (
              <div className="border-t border-stone-200 bg-stone-50/60 px-4 py-4">
                <OrderDetailsReadOnly order={order} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
