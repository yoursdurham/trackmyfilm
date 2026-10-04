"use client";

import Link from "next/link";
import { format } from "date-fns";
import FilmProcessBadge from "@/components/FilmProcessBadge";
import StatusBadge from "@/components/StatusBadge";
import { formatScanSizeLabel } from "@/lib/scan-size-display";
import { getOrderRollDetails } from "@/lib/order-roll-utils";
import type { FilmOrder } from "@/lib/types";

type Props = {
  order: FilmOrder;
  showDashboardLink?: boolean;
};

function formatTs(value?: string | null) {
  if (!value) return "—";
  return format(new Date(value), "MMM d, yyyy h:mm a");
}

export default function OrderDetailsReadOnly({ order, showDashboardLink = true }: Props) {
  const rolls = getOrderRollDetails(order);

  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Status</p>
          <div className="mt-1">
            <StatusBadge status={order.status} />
          </div>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Drop-off date</p>
          <p className="font-medium text-slate-800">
            {order.dropoff_date ? format(new Date(order.dropoff_date), "MMM d, yyyy") : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Roll count</p>
          <p className="font-medium text-slate-800">{order.roll_count}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Customer</p>
          <p className="font-medium text-slate-800">{order.customer_name}</p>
          {order.customer_email ? (
            <p className="text-slate-500">{order.customer_email}</p>
          ) : null}
        </div>
      </div>

      {rolls.length > 0 ? (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Film details
          </h4>
          <div className="space-y-2">
            {rolls.map((roll, index) => {
              const scanLabel = formatScanSizeLabel(roll.scan_size);
              return (
                <div
                  key={`${order.id}-profile-roll-${index}`}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                >
                  <p className="mb-2 font-medium text-slate-800">Roll {index + 1}</p>
                  <div className="flex flex-wrap gap-2">
                    {roll.film_type ? (
                      <span className="rounded-full bg-[var(--accent-tan)] px-2 py-0.5 text-xs font-medium text-[#A77B43]">
                        {roll.film_type}
                      </span>
                    ) : null}
                    {roll.film_process ? (
                      <FilmProcessBadge
                        process={roll.film_process}
                        className="rounded-full bg-[var(--accent-purple)] px-2 py-0.5 text-xs font-medium text-white"
                      />
                    ) : null}
                    {scanLabel ? (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {scanLabel}
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
              );
            })}
          </div>
        </section>
      ) : null}

      {order.notes?.trim() ? (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Order notes</h4>
          <p className="whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 p-3 text-slate-700">
            {order.notes.trim()}
          </p>
        </section>
      ) : null}

      {order.customer_notes?.trim() ? (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Customer-facing notes
          </h4>
          <p className="whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 p-3 text-slate-700">
            {order.customer_notes.trim()}
          </p>
        </section>
      ) : null}

      {order.scan_notes?.trim() ? (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Scans sent note
          </h4>
          <p className="whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 p-3 text-slate-700">
            {order.scan_notes.trim()}
          </p>
        </section>
      ) : null}

      <section className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-3">
        <div>
          <p className="text-xs text-slate-500">Received by Yours</p>
          <p className="text-slate-700">{formatTs(order.received_by_yours_at)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Received at Lab</p>
          <p className="text-slate-700">{formatTs(order.at_lab_at)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Scans sent</p>
          <p className="text-slate-700">{formatTs(order.scans_sent_at)}</p>
        </div>
      </section>

      {showDashboardLink ? (
        <Link
          href={`/dashboard?search=${encodeURIComponent(order.order_number)}`}
          className="inline-flex text-sm font-medium text-amber-700 hover:text-amber-800 hover:underline"
        >
          Open on dashboard →
        </Link>
      ) : null}
    </div>
  );
}
