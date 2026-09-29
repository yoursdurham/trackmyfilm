"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft, Calendar, Layers, Loader2, Mail, Phone, Save, User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import InternalHeader from "@/components/InternalHeader";
import { ORDER_STATUS } from "@/lib/constants";
import type { Customer, FilmOrder, FilmProcess, FilmType } from "@/lib/types";
import type { ContactMethod, CustomerOrderStats, DeliveryPreference } from "@/lib/customer-stats";

const FILM_TYPES: FilmType[] = ["35mm", "120", "110", "Disposable Camera"];
const FILM_PROCESSES: FilmProcess[] = ["Color", "Black & White", "Both"];
const SCAN_SIZES = ["Standard", "High-Res", "TIFF", "Process Only"] as const;
const CONTACT_METHODS: ContactMethod[] = ["email", "phone", "text"];
const DELIVERY_OPTIONS: DeliveryPreference[] = ["pickup", "ship", "email"];

type ProfileResponse = {
  customer: Customer;
  orders: FilmOrder[];
  stats: CustomerOrderStats;
};

function displayName(customer: Customer) {
  return `${customer.first_name} ${customer.last_name ?? ""}`.trim();
}

function statusClass(status: string) {
  if (status === ORDER_STATUS.RECEIVED_BY_YOURS) return "bg-[var(--accent-tan)] text-[#A77B43]";
  if (status === ORDER_STATUS.RECEIVED_AT_LAB) return "bg-[var(--accent-green)] text-white";
  if (status === ORDER_STATUS.READY_FOR_PICKUP) return "bg-amber-500 text-white";
  return "bg-[var(--accent-purple)] text-white";
}

export default function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Partial<Customer>>({});

  const { data, isLoading, error } = useQuery<ProfileResponse>({
    queryKey: ["customer-profile", id],
    queryFn: async () => {
      const response = await fetch(`/api/customers/${id}`);
      if (!response.ok) throw new Error("Customer not found");
      return response.json();
    },
  });

  const customer = data?.customer;
  const orders = data?.orders ?? [];
  const stats = data?.stats;

  const editState = useMemo(() => ({ ...customer, ...draft }), [customer, draft]);

  const saveMutation = useMutation({
    mutationFn: async (patch: Partial<Customer>) => {
      const response = await fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to save");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-profile", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setDraft({});
      toast.success("Customer saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSave = () => {
    if (!customer) return;
    const patch: Partial<Customer> = {};
    const fields: (keyof Customer)[] = [
      "notes", "phone", "preferred_contact_method",
      "default_film_type", "default_film_process", "default_scan_size", "default_delivery_preference",
    ];
    for (const field of fields) {
      if (editState[field] !== customer[field]) {
        (patch as Record<string, unknown>)[field] = editState[field];
      }
    }
    if (!Object.keys(patch).length) {
      toast.info("No changes to save");
      return;
    }
    saveMutation.mutate(patch);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-50 via-orange-50/30 to-amber-50/20">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  if (error || !customer || !stats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-50 via-orange-50/30 to-amber-50/20">
        <InternalHeader title="Customer" subtitle="Not found" />
        <main className="mx-auto max-w-3xl px-4 py-12 text-center">
          <p className="text-slate-600">This customer could not be found.</p>
          <Link
            href="/customers"
            className="mt-4 inline-flex h-8 items-center justify-center rounded-lg border border-stone-200 bg-white px-3 text-sm text-slate-700 hover:bg-stone-50"
          >
            Back to customers
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-orange-50/30 to-amber-50/20">
      <InternalHeader title={displayName(customer)} subtitle="Customer profile" />

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href="/customers"
          className="inline-flex items-center text-sm text-slate-600 hover:text-slate-800"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          All customers
        </Link>

        <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <h2 className="flex items-center gap-2 text-2xl font-semibold text-slate-800">
                <User className="h-5 w-5 text-amber-600" />
                {displayName(customer)}
              </h2>
              {customer.email ? (
                <p className="flex items-center gap-2 text-slate-600">
                  <Mail className="h-4 w-4 text-slate-400" />
                  {customer.email}
                </p>
              ) : null}
              {customer.phone ? (
                <p className="flex items-center gap-2 text-slate-600">
                  <Phone className="h-4 w-4 text-slate-400" />
                  {customer.phone}
                </p>
              ) : null}
            </div>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save changes
            </Button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total orders" value={String(stats.total_orders)} />
            <StatCard label="Total rolls" value={String(stats.total_rolls)} />
            <StatCard
              label="Last order"
              value={stats.last_order_date ? format(new Date(stats.last_order_date), "MMM d, yyyy") : "—"}
            />
            <StatCard
              label="Avg turnaround"
              value={stats.average_turnaround_days !== null ? `${stats.average_turnaround_days} days` : "—"}
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatCard label="Common film type" value={stats.common_film_type ?? "—"} small />
            <StatCard label="Common process" value={stats.common_film_process ?? "—"} small />
            <StatCard label="Common scan size" value={stats.common_scan_size ?? "—"} small />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Notes</h3>
            <Textarea
              value={editState.notes ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              placeholder="Internal notes about this customer..."
              className="min-h-28 border-stone-200"
            />
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Default preferences</h3>
            <div className="space-y-3">
              <Field label="Phone">
                <Input
                  value={editState.phone ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                  className="border-stone-200"
                />
              </Field>
              <Field label="Preferred contact">
                <select
                  value={editState.preferred_contact_method ?? ""}
                  onChange={(e) => setDraft((d) => ({
                    ...d,
                    preferred_contact_method: (e.target.value || undefined) as ContactMethod | undefined,
                  }))}
                  className="h-9 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-sm"
                >
                  <option value="">Not set</option>
                  {CONTACT_METHODS.map((method) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </Field>
              <Field label="Default film type">
                <select
                  value={editState.default_film_type ?? ""}
                  onChange={(e) => setDraft((d) => ({
                    ...d,
                    default_film_type: (e.target.value || undefined) as FilmType | undefined,
                  }))}
                  className="h-9 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-sm"
                >
                  <option value="">Not set</option>
                  {FILM_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </Field>
              <Field label="Default process">
                <select
                  value={editState.default_film_process ?? ""}
                  onChange={(e) => setDraft((d) => ({
                    ...d,
                    default_film_process: (e.target.value || undefined) as FilmProcess | undefined,
                  }))}
                  className="h-9 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-sm"
                >
                  <option value="">Not set</option>
                  {FILM_PROCESSES.map((process) => (
                    <option key={process} value={process}>{process}</option>
                  ))}
                </select>
              </Field>
              <Field label="Default scan size">
                <select
                  value={editState.default_scan_size ?? ""}
                  onChange={(e) => setDraft((d) => ({
                    ...d,
                    default_scan_size: (e.target.value || undefined) as Customer["default_scan_size"],
                  }))}
                  className="h-9 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-sm"
                >
                  <option value="">Not set</option>
                  {SCAN_SIZES.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </Field>
              <Field label="Delivery preference">
                <select
                  value={editState.default_delivery_preference ?? ""}
                  onChange={(e) => setDraft((d) => ({
                    ...d,
                    default_delivery_preference: (e.target.value || undefined) as DeliveryPreference | undefined,
                  }))}
                  className="h-9 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-sm"
                >
                  <option value="">Not set</option>
                  {DELIVERY_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </Field>
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Order history</h3>
          {orders.length === 0 ? (
            <p className="text-sm italic text-slate-400">No orders on record yet.</p>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-100 bg-stone-50/50 px-4 py-3 text-sm"
                >
                  <Link
                    href={`/dashboard?search=${encodeURIComponent(order.order_number)}`}
                    className="font-mono font-medium text-amber-700 hover:text-amber-800 hover:underline"
                  >
                    #{order.order_number}
                  </Link>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(order.status)}`}>
                    {order.status}
                  </span>
                  <span className="flex items-center gap-1 text-slate-500">
                    <Layers className="h-3.5 w-3.5" />
                    {order.roll_count} roll{order.roll_count !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Calendar className="h-3 w-3" />
                    {order.dropoff_date
                      ? format(new Date(order.dropoff_date), "MMM d, yyyy")
                      : "—"}
                  </span>
                  {order.film_process ? (
                    <span className="text-slate-500">{order.film_process}</span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function StatCard({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <div className={`rounded-lg border border-stone-100 bg-stone-50 px-4 py-3 ${small ? "" : ""}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 font-semibold text-slate-800 ${small ? "text-sm" : "text-lg"}`}>{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-500">{label}</label>
      {children}
    </div>
  );
}
