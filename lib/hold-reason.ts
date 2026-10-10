/** Staff-only free text stored on an On Hold order. Not shown to customers. */
export const HOLD_REASON_MAX_LENGTH = 200;

export function normalizeHoldReason(value: unknown): { reason: string | null; error?: string } {
  if (value == null) return { reason: null };
  if (typeof value !== "string") {
    return { reason: null, error: "Hold reason must be text" };
  }
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return { reason: null };
  if (trimmed.length > HOLD_REASON_MAX_LENGTH) {
    return {
      reason: null,
      error: `Hold reason must be ${HOLD_REASON_MAX_LENGTH} characters or fewer`,
    };
  }
  return { reason: trimmed };
}
