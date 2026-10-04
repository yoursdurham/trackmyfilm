"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CalculatedPreference } from "@/lib/customer-preference-calculations";

type Props<T extends string> = {
  label: string;
  calculated: CalculatedPreference<T>;
  manualValue: T | undefined | null;
  options: readonly T[];
  onSaveManual: (value: T) => void;
  onClearManual: () => void;
  saving?: boolean;
};

export default function CustomerPreferenceField<T extends string>({
  label,
  calculated,
  manualValue,
  options,
  onSaveManual,
  onClearManual,
  saving = false,
}: Props<T>) {
  const [editing, setEditing] = useState(false);
  const isManual = manualValue != null && manualValue !== "";
  const displayValue = isManual ? manualValue : calculated.value;

  return (
    <div className="border-b border-stone-100 py-3 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
          {editing ? (
            <select
              className="mt-1 h-9 w-full max-w-xs rounded-lg border border-stone-200 bg-white px-2.5 text-sm"
              defaultValue={displayValue ?? ""}
              onChange={(e) => {
                const v = e.target.value as T;
                if (v) onSaveManual(v);
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
            <p className="mt-0.5 font-medium text-slate-800">
              {displayValue ?? "Not enough data"}
            </p>
          )}
          {!editing ? (
            <p className="mt-0.5 text-xs text-slate-500">
              {isManual ? "Manual override" : calculated.helper ?? (calculated.totalOrders === 0 ? "Not enough data" : null)}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {!editing && displayValue ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-slate-600"
              disabled={saving}
              onClick={() => setEditing(true)}
            >
              Change
            </Button>
          ) : null}
          {isManual ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-amber-700 hover:text-amber-800"
              disabled={saving || !calculated.value}
              onClick={onClearManual}
            >
              Use calculated preference
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
