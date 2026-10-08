/**
 * Guest notes for the studio screen. Welcome and the active session show
 * `infoLines`. The ending-soon state shows `checkoutLines`. Door codes and
 * parking directions are intentionally not part of either list.
 */

export const STUDIO_LINE_MAX = 180;
export const STUDIO_LINE_LIMIT = 8;

export const DEFAULT_STUDIO_INFO_LINES = [
  "Wi-Fi: ask us for the network and password",
  "Bathrooms: through the hall and to the left",
  "The conference room isn't ours, so please only pass through it to reach the bathroom or kitchen",
  "Feel free to rearrange furniture, but please put it back when you're done",
] as const;

export const DEFAULT_STUDIO_CHECKOUT_LINES = [
  "Please put furniture back where it was",
  "Press the lock on the door on your way out.",
] as const;

function plainLine(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, STUDIO_LINE_MAX);
}

/** Keeps an ordered list of short plain-text lines. Non-arrays become empty. */
export function sanitizeStudioLines(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const lines: string[] = [];
  for (const entry of input) {
    const line = plainLine(entry);
    if (!line) continue;
    lines.push(line);
    if (lines.length >= STUDIO_LINE_LIMIT) break;
  }
  return lines;
}

/** Missing column uses the seeded copy. An explicit empty list stays empty. */
export function studioInfoLinesFromRow(input: unknown): string[] {
  if (input === undefined || input === null) return [...DEFAULT_STUDIO_INFO_LINES];
  return sanitizeStudioLines(input);
}

export function studioCheckoutLinesFromRow(input: unknown): string[] {
  if (input === undefined || input === null) return [...DEFAULT_STUDIO_CHECKOUT_LINES];
  return sanitizeStudioLines(input);
}
