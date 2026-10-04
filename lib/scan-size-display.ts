import type { RollDetail } from "@/lib/types";

const CANONICAL: RollDetail["scan_size"][] = ["Standard", "High-Res", "TIFF", "Process Only"];

const ALIAS_TO_LABEL: Record<string, RollDetail["scan_size"]> = {
  standard: "Standard",
  high_res: "High-Res",
  highres: "High-Res",
  "high-res": "High-Res",
  tiff: "TIFF",
  process_only: "Process Only",
  processonly: "Process Only",
};

/** Customer-facing scan size label for UI badges and summaries. */
export function formatScanSizeLabel(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if ((CANONICAL as string[]).includes(trimmed)) {
    return trimmed;
  }

  const normalized = trimmed.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  const aliased = ALIAS_TO_LABEL[normalized] ?? ALIAS_TO_LABEL[normalized.replace(/_/g, "")];
  if (aliased) return aliased;

  return trimmed;
}
