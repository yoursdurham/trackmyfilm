"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft, Loader2, Mail, Pencil, Save, User, X,
} from "lucide-react";
import { isValidEmail, normalizeEmail } from "@/lib/validation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import InternalHeader from "@/components/InternalHeader";
import CustomerPreferenceField from "@/components/CustomerPreferenceField";
import CustomerProfileOrderHistory from "@/components/CustomerProfileOrderHistory";
import { computeCalculatedPreferences } from "@/lib/customer-preference-calculations";
import type { Customer, FilmProcess, FilmType } from "@/lib/types";
import type { ContactMethod, CustomerOrderStats, DeliveryPreference } from "@/lib/customer-stats";

const FILM_TYPES: FilmType[] = ["35mm", "120", "110", "Disposable Camera"];
const FILM_PROCESSES: Array<Exclude<FilmProcess, "Both">> = ["Color", "Black & White"];
const SCAN_SIZES = ["Standard", "High-Res", "TIFF", "Process Only"] as const;
const CONTACT_METHODS: ContactMethod[] = ["email", "phone", "text"];
const DELIVERY_OPTIONS: DeliveryPreference[] = ["pickup", "ship", "email"];

type ProfileResponse = {
  customer: Customer;
  orders: import("@/lib/types").FilmOrder[];
  stats: CustomerOrderStats;
};

type IdentityDraft = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
};

function identityDraftFromCustomer(customer: Customer): IdentityDraft {
  return {
    first_name: customer.first_name ?? "",
    last_name: customer.last_name ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
  };
}

function displayName(customer: Customer) {
  return `${customer.first_name} ${customer.last_name ?? ""}`.trim();
}

export default function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [identityDraft, setIdentityDraft] = useState<IdentityDraft | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);

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

  const calculatedPrefs = useMemo(
    () => computeCalculatedPreferences(orders),
    [orders],
  );

  const notesValue = notesDraft ?? customer?.notes ?? "";

  type CustomerPatch = Omit<
    Partial<Customer>,
    | "default_film_type"
    | "default_film_process"
    | "default_scan_size"
    | "default_delivery_preference"
    | "preferred_contact_method"
  > & {
    default_film_type?: Customer["default_film_type"] | null;
    default_film_process?: Customer["default_film_process"] | null;
    default_scan_size?: Customer["default_scan_size"] | null;
    default_delivery_preference?: Customer["default_delivery_preference"] | null;
    preferred_contact_method?: Customer["preferred_contact_method"] | null;
  };

  const patchCustomer = async (patch: CustomerPatch) => {
    const response = await fetch(`/api/customers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error ?? "Failed to save");
    }
    return response.json() as Promise<Customer>;
  };

  const saveMutation = useMutation<Customer, Error, CustomerPatch>({
    mutationFn: patchCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-profile", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setNotesDraft(null);
      toast.success("Saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveIdentityMutation = useMutation({
    mutationFn: patchCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-profile", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["filmOrders"] });
      setEditingIdentity(false);
      setIdentityDraft(null);
      setIdentityError(null);
      toast.success("Customer information updated");
    },
    onError: (err: Error) => {
      setIdentityError(err.message);
      toast.error(err.message);
    },
  });

  const handleSaveNotes = () => {
    if (!customer) return;
    const trimmed = notesValue.trim();
    if (trimmed === (customer.notes ?? "").trim()) {
      toast.info("No changes to save");
      return;
    }
    saveMutation.mutate({ notes: trimmed || undefined });
  };

  const startEditIdentity = () => {
    if (!customer) return;
    setIdentityDraft(identityDraftFromCustomer(customer));
    setIdentityError(null);
    setEditingIdentity(true);
  };

  const cancelEditIdentity = () => {
    setEditingIdentity(false);
    setIdentityDraft(null);
    setIdentityError(null);
  };

  const handleSaveIdentity = () => {
    if (!customer || !identityDraft) return;
    setIdentityError(null);

    const first = identityDraft.first_name.trim();
    if (!first) {
      setIdentityError("First name is required");
      return;
    }

    const emailTrimmed = identityDraft.email.trim();
    if (emailTrimmed && !isValidEmail(emailTrimmed)) {
      setIdentityError("Enter a valid email address");
      return;
    }

    const patch: Partial<Customer> = {};
    const last = identityDraft.last_name.trim();
    const phone = identityDraft.phone.trim();

    if (first !== customer.first_name) patch.first_name = first;
    if (last !== (customer.last_name ?? "")) patch.last_name = last || undefined;
    if (emailTrimmed !== (customer.email ?? "")) {
      patch.email = emailTrimmed ? normalizeEmail(emailTrimmed) : undefined;
    }
    if (phone !== (customer.phone ?? "")) patch.phone = phone || undefined;

    if (!Object.keys(patch).length) {
      cancelEditIdentity();
      toast.info("No changes to save");
      return;
    }

    saveIdentityMutation.mutate(patch);
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

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        <Link
          href="/customers"
          className="inline-flex items-center text-sm text-slate-600 hover:text-slate-800"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          All customers
        </Link>

        {/* Customer summary */}
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {editingIdentity && identityDraft ? (
                <div className="space-y-3 max-w-md">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">First name *</label>
                      <Input
                        value={identityDraft.first_name}
                        onChange={(e) => setIdentityDraft((d) => d && ({ ...d, first_name: e.target.value }))}
                        className="border-stone-200"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">Last name</label>
                      <Input
                        value={identityDraft.last_name}
                        onChange={(e) => setIdentityDraft((d) => d && ({ ...d, last_name: e.target.value }))}
                        className="border-stone-200"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Email</label>
                    <Input
                      type="email"
                      value={identityDraft.email}
                      onChange={(e) => setIdentityDraft((d) => d && ({ ...d, email: e.target.value }))}
                      className="border-stone-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Phone</label>
                    <Input
                      type="tel"
                      value={identityDraft.phone}
                      onChange={(e) => setIdentityDraft((d) => d && ({ ...d, phone: e.target.value }))}
                      className="border-stone-200"
                    />
                  </div>
                  {identityError ? <p className="text-sm text-red-600">{identityError}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveIdentity}
                      disabled={saveIdentityMutation.isPending}
                      className="bg-amber-600 text-white hover:bg-amber-700"
                    >
                      {saveIdentityMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={cancelEditIdentity}>
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-semibold text-slate-800">{displayName(customer)}</h2>
                  {customer.email ? (
                    <p className="mt-1 flex items-center gap-2 text-slate-600">
                      <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                      {customer.email}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm italic text-slate-400">No email on file</p>
                  )}
                </>
              )}
            </div>
            {!editingIdentity ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={startEditIdentity}
                className="shrink-0 border-stone-200"
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit customer
              </Button>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
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

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <StatCard label="Common film type" value={stats.common_film_type ?? "—"} compact />
            <StatCard label="Common process" value={stats.common_film_process ?? "—"} compact />
            <StatCard label="Common scan size" value={stats.common_scan_size ?? "—"} compact />
          </div>
        </section>

        {/* Preferences */}
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Preferences</h3>
          <CustomerPreferenceField
            label="Film type"
            calculated={calculatedPrefs.film_type}
            manualValue={customer.default_film_type}
            options={FILM_TYPES}
            saving={saveMutation.isPending}
            onSaveManual={(value) => saveMutation.mutate({ default_film_type: value })}
            onClearManual={() => saveMutation.mutate({ default_film_type: null })}
          />
          <CustomerPreferenceField
            label="Process"
            calculated={calculatedPrefs.film_process}
            manualValue={customer.default_film_process}
            options={FILM_PROCESSES}
            saving={saveMutation.isPending}
            onSaveManual={(value) => saveMutation.mutate({ default_film_process: value })}
            onClearManual={() => saveMutation.mutate({ default_film_process: null })}
          />
          <CustomerPreferenceField
            label="Scan size"
            calculated={calculatedPrefs.scan_size}
            manualValue={customer.default_scan_size}
            options={SCAN_SIZES}
            saving={saveMutation.isPending}
            onSaveManual={(value) => saveMutation.mutate({ default_scan_size: value })}
            onClearManual={() => saveMutation.mutate({ default_scan_size: null })}
          />
          <ManualOnlyPreferenceRow
            label="Delivery"
            value={customer.default_delivery_preference}
            helper={
              customer.default_delivery_preference
                ? "Manual override"
                : "Not enough data"
            }
            options={DELIVERY_OPTIONS}
            saving={saveMutation.isPending}
            onSave={(value) => saveMutation.mutate({ default_delivery_preference: value })}
            onClear={() => saveMutation.mutate({ default_delivery_preference: null })}
          />
          <ManualOnlyPreferenceRow
            label="Preferred contact"
            value={customer.preferred_contact_method}
            helper={
              customer.preferred_contact_method
                ? "Manual override"
                : "Not enough data"
            }
            options={CONTACT_METHODS}
            saving={saveMutation.isPending}
            onSave={(value) => saveMutation.mutate({ preferred_contact_method: value })}
            onClear={() => saveMutation.mutate({ preferred_contact_method: null })}
          />
        </section>

        {/* Notes */}
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Notes</h3>
          <Textarea
            value={notesValue}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Internal notes about this customer..."
            className="min-h-24 border-stone-200"
          />
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={saveMutation.isPending}
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={handleSaveNotes}
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save notes
            </Button>
          </div>
        </section>

        {/* Order history */}
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Order history</h3>
          <CustomerProfileOrderHistory orders={orders} />
        </section>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-lg border border-stone-100 bg-stone-50 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`font-semibold text-slate-800 ${compact ? "text-sm" : "text-base"}`}>{value}</p>
    </div>
  );
}

function ManualOnlyPreferenceRow<T extends string>({
  label,
  value,
  helper,
  options,
  onSave,
  onClear,
  saving,
}: {
  label: string;
  value?: T | null;
  helper: string;
  options: readonly T[];
  onSave: (value: T) => void;
  onClear: () => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="border-b border-stone-100 py-3 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
          {editing ? (
            <select
              className="mt-1 h-9 w-full max-w-xs rounded-lg border border-stone-200 bg-white px-2.5 text-sm"
              defaultValue={value ?? ""}
              onChange={(e) => {
                const v = e.target.value as T;
                if (v) onSave(v);
                setEditing(false);
              }}
              onBlur={() => setEditing(false)}
              autoFocus
            >
              <option value="" disabled>Select…</option>
              {options.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <>
              <p className="mt-0.5 font-medium text-slate-800">{value ?? "Not enough data"}</p>
              <p className="mt-0.5 text-xs text-slate-500">{helper}</p>
            </>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          {!editing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={saving}
              onClick={() => setEditing(true)}
            >
              Change
            </Button>
          ) : null}
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-amber-700"
              disabled={saving}
              onClick={onClear}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
