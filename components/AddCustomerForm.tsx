"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { normalizeEmail, normalizeCustomerName } from "@/lib/validation";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const emptyForm = {
  email:             "",
  name:              "",
  last_name:         "",
  last_dropoff_date: "",
  last_order_number: "",
  current_rolls:     "",
  total_rolls:       "",
  total_dropoffs:    "",
  notes:             "",
};

export default function AddCustomerForm({ open, onOpenChange, onSuccess }: Props) {
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  const handleClose = () => { setFormData(emptyForm); setError(null); onOpenChange(false); };

  const set = (key: keyof typeof emptyForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setFormData((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const normalizedEmail = formData.email ? normalizeEmail(formData.email) : null;
      const fullName        = `${formData.name.trim()} ${formData.last_name.trim()}`.trim();
      const normalizedName  = normalizeCustomerName(fullName);

      // Check for duplicates
      const lookupRes = await fetch(
        `/api/customers/lookup?${normalizedEmail ? `email=${encodeURIComponent(normalizedEmail)}` : `name=${encodeURIComponent(normalizedName)}`}`
      );
      const existing = await lookupRes.json();
      if (existing) {
        setError(`Customer already exists: ${existing.name} ${existing.last_name || ""}`.trim());
        setLoading(false);
        return;
      }

      const payload = {
        name:              formData.name.trim(),
        last_name:         formData.last_name.trim() || null,
        email:             normalizedEmail,
        normalized_name:   normalizedName,
        last_dropoff_date: formData.last_dropoff_date || null,
        last_order_number: formData.last_order_number.trim() || null,
        current_rolls:     formData.current_rolls ? Number(formData.current_rolls) : null,
        total_rolls:       formData.total_rolls ? Number(formData.total_rolls) : 0,
        total_dropoffs:    formData.total_dropoffs ? Number(formData.total_dropoffs) : 0,
        notes:             formData.notes.trim() || null,
      };

      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create customer");
      }

      toast.success(`Customer ${payload.name} added`);
      onSuccess();
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = "border-slate-200 h-9 text-sm";
  const labelClass = "text-xs text-slate-600 font-medium";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-slate-800">Add New Customer</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Email — full width */}
          <div className="space-y-1">
            <Label htmlFor="email" className={labelClass}>Email</Label>
            <Input id="email" type="email" value={formData.email} onChange={set("email")}
              placeholder="customer@email.com" className={fieldClass} />
          </div>

          {/* First + Last Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="name" className={labelClass}>First Name *</Label>
              <Input id="name" value={formData.name} onChange={set("name")}
                placeholder="John" required className={fieldClass} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="last_name" className={labelClass}>Last Name</Label>
              <Input id="last_name" value={formData.last_name} onChange={set("last_name")}
                placeholder="Doe" className={fieldClass} />
            </div>
          </div>

          {/* Date + Order # */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="last_dropoff_date" className={labelClass}>Date (Last Drop-off)</Label>
              <Input id="last_dropoff_date" type="date" value={formData.last_dropoff_date}
                onChange={set("last_dropoff_date")} className={fieldClass} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="last_order_number" className={labelClass}>Order #</Label>
              <Input id="last_order_number" value={formData.last_order_number}
                onChange={set("last_order_number")} placeholder="JE1234"
                className={`${fieldClass} font-mono`} />
            </div>
          </div>

          {/* Current Rolls + Total Rolls + Drop-off Count */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="current_rolls" className={labelClass}>Current Rolls</Label>
              <Input id="current_rolls" type="number" min="0" value={formData.current_rolls}
                onChange={set("current_rolls")} placeholder="0" className={fieldClass} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="total_rolls" className={labelClass}>Total Rolls</Label>
              <Input id="total_rolls" type="number" min="0" value={formData.total_rolls}
                onChange={set("total_rolls")} placeholder="0" className={fieldClass} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="total_dropoffs" className={labelClass}>Drop-off Count</Label>
              <Input id="total_dropoffs" type="number" min="0" value={formData.total_dropoffs}
                onChange={set("total_dropoffs")} placeholder="0" className={fieldClass} />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="notes" className={labelClass}>Notes</Label>
            <Input id="notes" value={formData.notes} onChange={set("notes")}
              placeholder="Internal notes..." className={fieldClass} />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.name.trim()}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white">
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding...</> : "Add Customer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
