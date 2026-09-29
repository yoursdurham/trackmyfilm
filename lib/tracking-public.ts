import type { FilmOrder } from "@/lib/types";

const LINK_FIELDS = [
  "wetransfer_link",
  "color_scans_wetransfer_link",
  "bw_scans_wetransfer_link",
] as const;

/** Public tracking responses omit download URLs unless a valid token is present. */
export function serializeOrderForPublicTracking(
  order: FilmOrder,
  tokenIsValid: boolean
): Partial<FilmOrder> {
  if (tokenIsValid) return order;

  const publicOrder: Partial<FilmOrder> = { ...order };
  for (const field of LINK_FIELDS) {
    delete publicOrder[field];
  }
  return publicOrder;
}
