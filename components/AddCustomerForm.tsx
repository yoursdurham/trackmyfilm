"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { User, Mail, Phone, FileText, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { normalizeEmail, normalizeCustomerName } from "@/lib/validation";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const emptyForm = { name: "", last_name: "", email: "", phone: "", notes: "" };

export default function AddCustomerForm({ open, onOpenChange, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  const handleClose = () => {
    setFormData(emptyForm);
    setError(null);
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const normalizedEmail = formData.email ? normalizeEmail(formData.email) : null;
      const fullName = `${formData.name.trim()} ${formData.last_name?.trim() || ""}`.trim();
      const normalizedName = normalizeCustomerName(fullName);

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
        name: formData.name.trim(),
        last_name: formData.last_name?.trim() || null,
        normalized_name: normalizedName,
        email: normalizedEmail,
        phone: formData.phone?.trim() || null,
        notes: formData.notes?.trim() || null,
        total_rolls: 0,
        total_dropoffs: 0,
        points: 0,
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

      toast.success(`Customer ${payload.name} added successfully`);
      onSuccess();
      handleClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create customer";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const field = (key: keyof typeof emptyForm) => ({
    value: formData[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setFormData((prev) => ({ ...prev, [key]: e.target.value })),
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-slate-800">Add New Customer</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800">Error</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name" className="flex items-center gap-2 text-slate-700">
              <User className="w-3.5 h-3.5" /> First Name *
            </Label>
            <Input id="name" {...field("name")} placeholder="John" required className="border-slate-200" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="last_name" className="flex items-center gap-2 text-slate-700">
              <User className="w-3.5 h-3.5" /> Last Name
            </Label>
            <Input id="last_name" {...field("last_name")} placeholder="Doe" className="border-slate-200" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2 text-slate-700">
              <Mail className="w-3.5 h-3.5" /> Email
            </Label>
            <Input id="email" type="email" {...field("email")} placeholder="customer@email.com" className="border-slate-200" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="flex items-center gap-2 text-slate-700">
              <Phone className="w-3.5 h-3.5" /> Phone
            </Label>
            <Input id="phone" type="tel" {...field("phone")} placeholder="(555) 123-4567" className="border-slate-200" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="flex items-center gap-2 text-slate-700">
              <FileText className="w-3.5 h-3.5" /> Notes
            </Label>
            <Textarea id="notes" {...field("notes")} placeholder="Add any notes about this customer..."
              className="border-slate-200 resize-none" rows={3} />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.name.trim()} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white">
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding...</> : "Add Customer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
