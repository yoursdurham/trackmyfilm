/**
 * Counting rules for the studio film-stats screen.
 * Change them here; the metrics service and the screen both read this object.
 *
 * Column names follow the live order code (lib/types.ts, lib/turnaround-time.ts,
 * lib/scan-batch.ts), not the drifted migration files:
 *   received_by_yours_at, dropoff_date, at_lab_at (legacy received_at_lab_at),
 *   scans_sent_at, color_scans_delivered_at, bw_scans_delivered_at,
 *   roll_count, roll_details, film_process, status.
 */
export const FILM_METRICS_CONFIG = {
  timezone: "America/New_York",
  /** Count rolls (roll_details, otherwise roll_count), not orders. */
  countUnit: "rolls" as const,
  /**
   * Sunday. Matches the Numbers page week (Date#getDay, where 0 is Sunday).
   * Reports has no calendar week; this is the same Sunday start the shop already uses.
   */
  weekStartsOn: 0,
  /** Rolling window for Received at Lab → Scans Sent, in exact 24-hour days. */
  turnaroundWindowDays: 30,
  /**
   * Below this many completed rolls on a side, that average is omitted
   * so one or two orders cannot flash a noisy number.
   */
  minimumTurnaroundSamples: 3,
  /**
   * Used when an order has no roll_details and roll_count is missing or not positive.
   */
  fallbackRollCount: 1,
  /**
   * Mixed ("Both") orders with no roll_details split roll_count across the two
   * sides. Color receives the extra roll when the count is odd, so a roll is
   * not counted twice in the scans-sent totals.
   * A roll_details entry tagged Both counts once in scans-sent (on the first
   * side that was delivered) and once on each side's turnaround when that side
   * has a delivery time.
   */
  mixedRollSplit: "half-round-color" as const,
  /** Reuse one database read across the kiosk's 30-second polls. */
  cacheTtlMs: 20_000,
  /**
   * Film leaves for the lab on these weekdays at this America/New_York time.
   * 0 is Sunday, 2 is Tuesday, 5 is Friday.
   * The screen says "Today 12:00 PM" on a run day until that time, then the next run.
   */
  labRuns: {
    weekdays: [2, 5] as readonly number[],
    hour: 12,
    minute: 0,
  },
} as const;

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** "Tuesdays and Fridays" — derived from labRuns so the caption stays in sync. */
export function labRunScheduleLabel(
  weekdays: readonly number[] = FILM_METRICS_CONFIG.labRuns.weekdays,
): string {
  const names = weekdays
    .filter((day) => day >= 0 && day < WEEKDAY_NAMES.length)
    .map((day) => `${WEEKDAY_NAMES[day]}s`);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
