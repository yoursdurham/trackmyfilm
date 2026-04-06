"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { User, Calendar, Hash, Layers, Loader2, Film, Mail } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Customer } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  customers?: Customer[];
  selectedCustomer?: Customer | null;
}

const FILM_STOCKS = [
  "Kodak Portra 400",
  "Kodak Portra 800",
  "Kodak Portra 160",
  "Kodak Gold 200",
  "Kodak UltraMax 400",
  "Kodak ColorPlus 200",
  "Kodak Ektar 100",
  "Kodak T-Max 400",
  "Kodak T-Max 100",
  "Kodak Tri-X 400",
  "Fujifilm Superia 400",
  "Fujifilm Superia 200",
  "Fujifilm Pro 400H",
  "Fujifilm Velvia 50",
  "Fujifilm Provia 100F",
  "Ilford HP5 Plus 400",
  "Ilford Delta 400",
  "Ilford XP2 Super 400",
  "Cinestill 800T",
  "Cinestill 400D",
  "Lomography Color 400",
  "Other",
];

const emptyForm = {
  customer_name: "",
  customer_email: "",
  order_number: "",
  dropoff_date: format(new Date(), "yyyy-MM-dd"),
  roll_count: 1,
  film_type: "" as "" | "35mm" | "120",
  film_process: "" as "" | "Color" | "Black & White" | "Both",
  film_stock: "",
  notes: "",
};

export default function NewDropoffForm({ open, onOpenChange, onSuccess, customers = [], selectedCustomer }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(selectedCustomer?.id ?? null);
  const [formData, setFormData] = useState({
    ...emptyForm,
    customer_name: selectedCustomer ? `${selectedCustomer.name} ${selectedCustomer.last_name || ""}`.trim() : "",
    customer_email: selectedCustomer?.email || "",
  });

  const set = (key: keyof typeof emptyForm, value: unknown) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.customer_name.trim()) { toast.error("Customer name is required"); return; }
    if (!formData.order_number.trim()) { toast.error("Order number is required"); return; }
    if (!formData.roll_count || formData.roll_count < 1) { toast.error("Roll count must be at least 1"); return; }
    if (!formData.film_type) { toast.error("Please select a film type"); return; }
    if (!formData.film_process) { toast.error("Please select a film process"); return; }

    setLoading(true);
    try {
      // Single call — server handles customer lookup/create, order, totals, and email
      const res = await fetch("/api/dropoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name:  formData.customer_name.trim(),
          customer_email: formData.customer_email.trim() || undefined,
          order_number:   formData.order_number.trim(),
          dropoff_date:   formData.dropoff_date,
          roll_count:     Number(formData.roll_count),
          film_type:      formData.film_type,
          film_process:   formData.film_process,
          film_stock:     formData.film_stock || undefined,
          notes:          formData.notes || undefined,
        }),
      });

      const data = await res.json() as {
        success?: boolean;
        error?: string;
        customer?: { name: string; isNew: boolean; total_dropoffs: number };
        email?: { sent: boolean; skipped?: boolean; variant?: string; error?: string };
      };

      if (!res.ok) {
        throw new Error(data.error || "Failed to create drop-off");
      }

      // Show customer status
      if (data.customer?.isNew) {
        toast.success(`New customer created: ${data.customer.name}`);
      } else if (data.customer) {
        toast.success(`Matched existing customer: ${data.customer.name} (drop-off #${data.customer.total_dropoffs})`);
      }

      // Show email status
      if (data.email?.sent) {
        const variant = data.email.variant;
        if (variant === "loyalty_5")  toast.success("🎉 5th visit loyalty email sent!");
        else if (variant === "loyalty_10") toast.success("🎉 10th visit loyalty email sent!");
        else toast.success("Confirmation email sent");
      } else if (data.email?.skipped) {
        if (data.email.error) toast.info(`No email: ${data.email.error}`);
      } else if (data.email?.error) {
        toast.error(`Order created but email failed: ${data.email.error}`);
      }

      toast.success("Drop-off created successfully");
      onSuccess?.();
      setFormData({ ...emptyForm, dropoff_date: format(new Date(), "yyyy-MM-dd") });
      setSelectedCustomerId(null);
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create drop-off";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = customers.filter((c) => {
    const name = formData.customer_name.toLowerCase();
    const email = formData.customer_email.toLowerCase();
    if (!name && !email) return false;
    return (
      (name && (`${c.name} ${c.last_name ?? ""}`.toLowerCase().includes(name))) ||
      (email && c.email?.toLowerCase().includes(email))
    );
  }).slice(0, 5);

  const selectCustomer = (c: Customer) => {
    setFormData((prev) => ({
      ...prev,
      customer_name: `${c.name} ${c.last_name || ""}`.trim(),
      customer_email: c.email || "",
    }));
    setSelectedCustomerId(c.id);
    setShowSuggestions(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-slate-800">New Film Drop-off</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded-lg text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Customer name */}
          <div className="space-y-2 relative">
            <Label htmlFor="customer_name" className="flex items-center gap-2 text-slate-700">
              <User className="w-3.5 h-3.5" /> Customer Name *
            </Label>
            <Input id="customer_name" value={formData.customer_name} placeholder="John Doe" required
              className="border-slate-200"
              onChange={(e) => { set("customer_name", e.target.value); setShowSuggestions(true); setSelectedCustomerId(null); }}
              onFocus={() => setShowSuggestions(true)} />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {suggestions.map((c) => (
                  <button key={c.id} type="button" onClick={() => selectCustomer(c)}
                    className="w-full text-left px-3 py-2 hover:bg-amber-50 border-b border-slate-100 last:border-0">
                    <p className="font-medium text-sm text-slate-800">{c.name} {c.last_name}</p>
                    {c.email && <p className="text-xs text-slate-500">{c.email}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="customer_email" className="flex items-center gap-2 text-slate-700">
              <Mail className="w-3.5 h-3.5" /> Email {!selectedCustomerId && "*"}
            </Label>
            <Input id="customer_email" type="email" value={formData.customer_email}
              placeholder="customer@email.com" required={!selectedCustomerId}
              className="border-slate-200"
              onChange={(e) => { set("customer_email", e.target.value); setShowSuggestions(true); setSelectedCustomerId(null); }} />
            <p className="text-xs text-slate-500">Confirmation email will be sent to this address</p>
          </div>

          {/* Date + Order # */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dropoff_date" className="flex items-center gap-2 text-slate-700">
                <Calendar className="w-3.5 h-3.5" /> Drop-off Date *
              </Label>
              <Input id="dropoff_date" type="date" value={formData.dropoff_date} required
                className="border-slate-200"
                onChange={(e) => set("dropoff_date", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order_number" className="flex items-center gap-2 text-slate-700">
                <Hash className="w-3.5 h-3.5" /> Order Number *
              </Label>
              <Input id="order_number" value={formData.order_number} placeholder="JE1234" required
                className="border-slate-200"
                onChange={(e) => set("order_number", e.target.value)} />
            </div>
          </div>

          {/* Roll count */}
          <div className="space-y-2">
            <Label htmlFor="roll_count" className="flex items-center gap-2 text-slate-700">
              <Layers className="w-3.5 h-3.5" /> Number of Rolls *
            </Label>
            <Input id="roll_count" type="number" min="1" value={formData.roll_count} required
              className="border-slate-200"
              onChange={(e) => set("roll_count", Number(e.target.value))} />
          </div>

          {/* Film type */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-slate-700">
              <Film className="w-3.5 h-3.5" /> Film Type *
            </Label>
            <div className="flex gap-4">
              {(["35mm", "120"] as const).map((t) => (
                <div key={t} className="flex items-center space-x-2">
                  <Checkbox id={t} checked={formData.film_type === t} onCheckedChange={() => set("film_type", t)} />
                  <label htmlFor={t} className="text-sm font-medium">{t}</label>
                </div>
              ))}
            </div>
          </div>

          {/* Film process */}
          <div className="space-y-2">
            <Label className="text-slate-700">Film Process *</Label>
            <div className="flex flex-col gap-2">
              {(["Color", "Black & White", "Both"] as const).map((p) => (
                <div key={p} className="flex items-center space-x-2">
                  <Checkbox id={p} checked={formData.film_process === p} onCheckedChange={() => set("film_process", p)} />
                  <label htmlFor={p} className="text-sm font-medium">{p}</label>
                </div>
              ))}
            </div>
          </div>

          {/* Film stock */}
          <div className="space-y-2">
            <Label htmlFor="film_stock" className="text-slate-700">Film Stock</Label>
            <select
              id="film_stock"
              value={formData.film_stock}
              onChange={(e) => set("film_stock", e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Select film stock (optional)</option>
              {FILM_STOCKS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-slate-700">Notes</Label>
            <Textarea id="notes" value={formData.notes} placeholder="Add any notes about this drop-off..."
              className="border-slate-200 resize-none" rows={3}
              onChange={(e) => set("notes", e.target.value)} />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white">
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Create Drop-off"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
