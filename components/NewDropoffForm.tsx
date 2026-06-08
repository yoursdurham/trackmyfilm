"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { User, Calendar, Hash, Layers, Loader2, Film, Mail } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Customer, FilmType, FilmProcess } from "@/lib/types";

const MAX_ROLLS = 20;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  customers?: Customer[];
  selectedCustomer?: Customer | null;
}

const FILM_STOCKS = [
  "Kodak Portra 400", "Kodak Portra 800", "Kodak Portra 160",
  "Kodak Gold 200", "Kodak UltraMax 400", "Kodak ColorPlus 200",
  "Kodak Ektar 100", "Kodak T-Max 400", "Kodak T-Max 100", "Kodak Tri-X 400",
  "Fujifilm Superia 400", "Fujifilm Superia 200", "Fujifilm Pro 400H",
  "Fujifilm Velvia 50", "Fujifilm Provia 100F",
  "Ilford HP5 Plus 400", "Ilford Delta 400", "Ilford XP2 Super 400",
  "Cinestill 800T", "Cinestill 400D",
  "Lomography Color 400",
];

const FILM_TYPES: FilmType[] = ["35mm", "120"];
const FILM_PROCESSES: FilmProcess[] = ["Color", "Black & White"];
const SCAN_SIZES = ["Standard", "High-Res", "TIFF", "Process Only"] as const;

type ScanSize = (typeof SCAN_SIZES)[number];

interface RollState {
  film_type: FilmType | "";
  film_process: FilmProcess | "";
  film_stock: string;       // selected from dropdown (empty = none, "__other__" = custom)
  custom_stock: string;     // shown when film_stock === "__other__"
  scan_size: ScanSize;
  prints_4x6: boolean;
}

const emptyRoll = (): RollState => ({
  film_type: "",
  film_process: "",
  film_stock: "",
  custom_stock: "",
  scan_size: "Standard",
  prints_4x6: false,
});

const emptyMeta = {
  customer_name: "",
  customer_email: "",
  order_number: "",
  dropoff_date: format(new Date(), "yyyy-MM-dd"),
  roll_count: 1,
  notes: "",
};

export default function NewDropoffForm({ open, onOpenChange, onSuccess, customers = [], selectedCustomer }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(selectedCustomer?.id ?? null);
  const [sendEmail, setSendEmail] = useState(true);
  const [formData, setFormData] = useState({
    ...emptyMeta,
    customer_name: selectedCustomer ? `${selectedCustomer.first_name} ${selectedCustomer.last_name || ""}`.trim() : "",
    customer_email: selectedCustomer?.email || "",
  });
  const [rolls, setRolls] = useState<RollState[]>([emptyRoll()]);
  const [customStocks, setCustomStocks] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/film-stocks")
      .then((r) => r.ok ? r.json() : [])
      .then((data: string[]) => setCustomStocks(data))
      .catch(() => {});
  }, [open]);

  const set = (key: keyof typeof emptyMeta, value: unknown) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  const handleRollCountChange = (raw: number) => {
    const count = Math.min(Math.max(1, raw || 1), MAX_ROLLS);
    set("roll_count", count);
    setRolls((prev) => {
      const next = [...prev];
      while (next.length < count) next.push(emptyRoll());
      return next.slice(0, count);
    });
  };

  const setRoll = <K extends keyof RollState>(index: number, key: K, value: RollState[K]) =>
    setRolls((prev) => prev.map((r, i) => i === index ? { ...r, [key]: value } : r));

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError("");

    if (!formData.customer_name.trim()) { toast.error("Customer name is required"); return; }
    if (!formData.order_number.trim()) { toast.error("Order number is required"); return; }
    if (!formData.roll_count || formData.roll_count < 1) { toast.error("Roll count must be at least 1"); return; }

    for (let i = 0; i < rolls.length; i++) {
      if (!rolls[i].film_type) { toast.error(`Select a film type for roll ${i + 1}`); return; }
      if (!rolls[i].film_process) { toast.error(`Select a film process for roll ${i + 1}`); return; }
      if (rolls[i].film_stock === "__other__" && !rolls[i].custom_stock.trim()) {
        toast.error(`Enter the film stock name for roll ${i + 1}`); return;
      }
    }

    setLoading(true);
    try {
      const roll_details = rolls.map((r) => ({
        film_type: r.film_type as FilmType,
        film_process: r.film_process as FilmProcess,
        film_stock: r.film_stock === "__other__" ? r.custom_stock.trim() || undefined
          : r.film_stock || undefined,
        scan_size: r.scan_size,
        prints_4x6: r.prints_4x6,
      }));

      const res = await fetch("/api/dropoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name:  formData.customer_name.trim(),
          customer_email: formData.customer_email.trim() || undefined,
          order_number:   formData.order_number.trim(),
          dropoff_date:   formData.dropoff_date,
          roll_count:     Number(formData.roll_count),
          film_type:      roll_details[0].film_type,
          film_process:   roll_details[0].film_process,
          film_stock:     roll_details[0].film_stock,
          roll_details,
          notes:          formData.notes || undefined,
          send_email:     sendEmail,
        }),
      });

      const data = await res.json() as {
        success?: boolean;
        error?: string;
        customer?: { name: string; isNew: boolean; total_dropoffs: number };
        email?: { sent: boolean; skipped?: boolean; variant?: string; error?: string };
      };

      if (!res.ok) throw new Error(data.error || "Failed to create drop-off");

      if (data.customer?.isNew) {
        toast.success(`New customer created: ${data.customer.name}`);
      } else if (data.customer) {
        toast.success(`Matched existing customer: ${data.customer.name} (drop-off #${data.customer.total_dropoffs})`);
      }

      if (data.email?.sent) {
        toast.success("Confirmation email sent");
      } else if (data.email?.skipped) {
        if (data.email.error) toast.info(`No email: ${data.email.error}`);
      } else if (data.email?.error) {
        toast.error(`Order created but email failed: ${data.email.error}`);
      }

      toast.success("Drop-off created successfully");
      onSuccess?.();
      setFormData({ ...emptyMeta, dropoff_date: format(new Date(), "yyyy-MM-dd") });
      setRolls([emptyRoll()]);
      setSelectedCustomerId(null);
      setSendEmail(true);
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
      (name && (`${c.first_name} ${c.last_name ?? ""}`.toLowerCase().includes(name))) ||
      (email && c.email?.toLowerCase().includes(email))
    );
  }).slice(0, 5);

  const selectCustomer = (c: Customer) => {
    setFormData((prev) => ({
      ...prev,
      customer_name: `${c.first_name} ${c.last_name || ""}`.trim(),
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
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)} />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {suggestions.map((c) => (
                  <button key={c.id} type="button" onClick={() => selectCustomer(c)}
                    className="w-full text-left px-3 py-2 hover:bg-amber-50 border-b border-slate-100 last:border-0">
                    <p className="font-medium text-sm text-slate-800">{c.first_name} {c.last_name}</p>
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
              <Layers className="w-3.5 h-3.5" /> Number of Rolls *{" "}
              <span className="text-xs text-slate-400 font-normal">(max {MAX_ROLLS})</span>
            </Label>
            <Input id="roll_count" type="number" min="1" max={MAX_ROLLS} value={formData.roll_count} required
              className="border-slate-200"
              onChange={(e) => handleRollCountChange(Number(e.target.value))} />
          </div>

          {/* Per-roll details */}
          <div className="space-y-3">
            {rolls.map((roll, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 space-y-3">
                <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Film className="w-3.5 h-3.5 text-amber-500" />
                  Roll {i + 1}
                </p>

                {/* Film type */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-600">Film Type *</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {FILM_TYPES.map((t) => (
                      <div key={t} className="flex items-center space-x-2">
                        <Checkbox id={`ft-${i}-${t}`} checked={roll.film_type === t}
                          onCheckedChange={() => setRoll(i, "film_type", t)} />
                        <label htmlFor={`ft-${i}-${t}`} className="text-sm font-medium">{t}</label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Film process */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-600">Film Process *</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {FILM_PROCESSES.map((p) => (
                      <div key={p} className="flex items-center space-x-2">
                        <Checkbox id={`fp-${i}-${p}`} checked={roll.film_process === p}
                          onCheckedChange={() => setRoll(i, "film_process", p)} />
                        <label htmlFor={`fp-${i}-${p}`} className="text-sm font-medium">{p}</label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Scan size */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-600">Scan Size</p>
                  <select
                    value={roll.scan_size}
                    onChange={(e) => setRoll(i, "scan_size", e.target.value as ScanSize)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {SCAN_SIZES.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </div>

                {/* 4x6 Prints */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-600">4x6 Prints</p>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id={`prints-yes-${i}`}
                        name={`prints-${i}`}
                        checked={roll.prints_4x6}
                        onChange={() => setRoll(i, "prints_4x6", true)}
                        className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-slate-300"
                      />
                      <label htmlFor={`prints-yes-${i}`} className="text-sm font-medium">Yes</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id={`prints-no-${i}`}
                        name={`prints-${i}`}
                        checked={!roll.prints_4x6}
                        onChange={() => setRoll(i, "prints_4x6", false)}
                        className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-slate-300"
                      />
                      <label htmlFor={`prints-no-${i}`} className="text-sm font-medium">No</label>
                    </div>
                  </div>
                </div>

                {/* Film stock */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-600">Film Stock</p>
                  <select
                    value={roll.film_stock}
                    onChange={(e) => setRoll(i, "film_stock", e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Select film stock (optional)</option>
                    {FILM_STOCKS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                    {customStocks.filter((s) => !FILM_STOCKS.includes(s)).sort().map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                    <option value="__other__">Other (specify below)</option>
                  </select>
                  {roll.film_stock === "__other__" && (
                    <Input
                      value={roll.custom_stock}
                      placeholder="e.g. Kodak Vision3 500T"
                      className="border-slate-200 mt-1"
                      onChange={(e) => setRoll(i, "custom_stock", e.target.value)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-slate-700">Notes</Label>
            <Textarea id="notes" value={formData.notes} placeholder="Add any notes about this drop-off..."
              className="border-slate-200 resize-none" rows={3}
              onChange={(e) => set("notes", e.target.value)} />
          </div>

          {/* Email toggle */}
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <Checkbox id="send_email" checked={sendEmail} onCheckedChange={(v) => setSendEmail(!!v)} />
            <div>
              <label htmlFor="send_email" className="text-sm font-medium text-slate-700 cursor-pointer">
                Send confirmation email
              </label>
              <p className="text-xs text-slate-500">
                {sendEmail ? "Customer will receive an email when this drop-off is submitted" : "No email will be sent for this drop-off"}
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
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
