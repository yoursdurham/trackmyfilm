"use client";

import type { OpenSignMode } from "@/lib/shop-hours";

const CHOICES: { value: OpenSignMode; label: string }[] = [
  { value: "auto", label: "Auto (by hours)" },
  { value: "on", label: "On now" },
  { value: "off", label: "Off" },
];

/** Front-window only. Auto follows retail hours. On now lasts until midnight ET. */
export default function OpenSignControl({
  value,
  onChange,
}: {
  value: OpenSignMode;
  onChange: (mode: OpenSignMode) => void;
}) {
  return (
    <fieldset className="mt-4" aria-label="Open sign for Front window">
      <legend className="text-sm text-slate-600">Open sign</legend>
      <div className="mt-2 flex flex-col gap-2">
        {CHOICES.map((choice) => {
          const selected = value === choice.value;
          return (
            <label
              key={choice.value}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                selected
                  ? "border-amber-500 bg-amber-50 text-slate-800"
                  : "border-stone-200 text-slate-600"
              }`}
            >
              <input
                type="radio"
                name="open-sign-mode"
                value={choice.value}
                className="h-4 w-4 accent-amber-600"
                checked={selected}
                onChange={() => onChange(choice.value)}
              />
              {choice.label}
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Auto follows Thursday 5–7PM and Saturday 11–2PM. On now shows the sign until midnight ET, then returns to Auto. Off hides it even during open hours. A custom message still covers the sign.
      </p>
    </fieldset>
  );
}
