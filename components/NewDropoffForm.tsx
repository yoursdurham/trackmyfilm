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
import { normalizeEmail, normalizeCustomerName } from "@/lib/validation";
import type { Customer } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  customers?: Customer[];
  selectedCustomer?: Customer | null;
}

const emptyForm = {
  customer_name: "",
  customer_email: "",
  order_number: "",
  dropoff_date: format(new Date(), "yyyy-MM-dd"),
  roll_count: 1,
  film_type: "" as "" | "35mm" | "120",
  film_process: "" as "" | "Color" | "Black & White" | "Both",
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
      const normalizedEmail = normalizeEmail(formData.customer_email);
      const nameParts = formData.customer_name.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ");
      const normalizedName = normalizeCustomerName(formData.customer_name);

      // Find or create customer
      let customer: Customer | null = selectedCustomer ?? null;

      if (!customer) {
        const lookupRes = await fetch(
          `/api/customers/lookup?${normalizedEmail ? `email=${encodeURIComponent(normalizedEmail)}` : `name=${encodeURIComponent(normalizedName)}`}`
        );
        const found = await lookupRes.json();
        if (found) {
          customer = found;
          toast.success(`Matched existing customer: ${found.name} ${found.last_name || ""}`.trim());
        }
      }

      if (!customer) {
        const res = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: firstName,
            last_name: lastName || null,
            normalized_name: normalizedName,
            email: normalizedEmail || null,
            total_rolls: 0,
            total_dropoffs: 0,
            points: 0,
          }),
        });
        customer = await res.json();
        toast.success(`Created new customer: ${customer!.name}`);
      }

      const newTotalRolls = (customer!.total_rolls || 0) + Number(formData.roll_count);
      const newTotalDropoffs = (customer!.total_dropoffs || 0) + 1;
      const now = new Date().toISOString();

      // Create order
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customer!.id,
          customer_email: normalizedEmail,
          customer_name: formData.customer_name.trim(),
          order_number: formData.order_number.trim().toUpperCase(),
          dropoff_date: formData.dropoff_date,
          roll_count: Number(formData.roll_count),
          film_type: formData.film_type,
          film_process: formData.film_process,
          dropoff_number: newTotalDropoffs,
          status: "Received by Yours",
          status_history: [{ status: "Received by Yours", changed_at: now }],
          received_by_yours_at: now,
          status_updated_at: now,
          notes: formData.notes || null,
        }),
      });

      const newOrder = await orderRes.json();

      // Update customer totals
      await fetch(`/api/customers/${customer!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ total_rolls: newTotalRolls, total_dropoffs: newTotalDropoffs }),
      });

      // Send confirmation email
      if (normalizedEmail) {
        await fetch("/api/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: newOrder.id, template: "film_drop_received" }),
        }).catch(() => toast.error("Order created but confirmation email failed"));
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
