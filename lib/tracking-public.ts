import type { FilmOrder } from "@/lib/types";

const LINK_FIELDS = [
  "wetransfer_link",
  "color_scans_wetransfer_link",
  "bw_scans_wetransfer_link",
] as const;

/** Staff / system fields not shown on public tracking (general `notes` is customer-facing). */
const INTERNAL_ONLY_FIELDS = [
  "scan_notes",
  "customer_notes",
  "email_status",
  "email_error",
] as const satisfies readonly (keyof FilmOrder)[];

/** Public tracking responses omit download URLs unless a valid token is present. */
export function serializeOrderForPublicTracking(
  order: FilmOrder,
  tokenIsValid: boolean
): Partial<FilmOrder> {
  const publicOrder: Partial<FilmOrder> = tokenIsValid ? { ...order } : { ...order };

  if (!tokenIsValid) {
    for (const field of LINK_FIELDS) {
      delete publicOrder[field];
    }
  }

  for (const field of INTERNAL_ONLY_FIELDS) {
    delete publicOrder[field];
  }

  return publicOrder;
}

export function orderNoteForCustomerDisplay(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
