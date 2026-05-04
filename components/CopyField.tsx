import type { LucideIcon } from "lucide-react";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

export default function CopyField({
  label,
  value,
  className = "",
  valueClassName = "text-sm font-medium text-slate-800",
  compact = false,
  variant = "field",
  icon: Icon,
  showLabel = false,
  inlineLabel = false,
}: {
  label: string;
  value?: string | null;
  className?: string;
  valueClassName?: string;
  compact?: boolean;
  variant?: "field" | "metadata";
  icon?: LucideIcon;
  showLabel?: boolean;
  inlineLabel?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const displayValue = value?.trim();

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!displayValue) return;

    await navigator.clipboard.writeText(displayValue);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1000);
  };

  if (variant === "metadata") {
    return (
      <div className={`flex items-center gap-2 text-sm text-slate-600 ${className}`}>
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : null}
        <div className="min-w-0 flex-1">
          {inlineLabel ? (
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
              {displayValue ? (
                <span className={`min-w-0 truncate ${valueClassName}`}>{displayValue}</span>
              ) : (
                <span className="min-w-0 truncate italic text-slate-300">—</span>
              )}
            </div>
          ) : (
            <>
              {showLabel ? (
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
              ) : null}
              {displayValue ? (
                <p className={`truncate ${valueClassName}`}>{displayValue}</p>
              ) : (
                <p className="truncate italic text-slate-300">—</p>
              )}
            </>
          )}
        </div>
        {displayValue ? (
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={`Copy ${label}`}
            title={`Copy ${label}`}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between gap-2 ${compact ? "" : "rounded-lg border border-slate-100 bg-white px-3 py-2"} ${className}`}>
      <div className="min-w-0">
        {!compact ? (
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        ) : null}
        {displayValue ? (
          <p className={`truncate ${valueClassName}`}>{displayValue}</p>
        ) : (
          <p className="truncate text-sm italic text-slate-300">—</p>
        )}
      </div>
      {displayValue ? (
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label={`Copy ${label}`}
          title={`Copy ${label}`}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </div>
  );
}
