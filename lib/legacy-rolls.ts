/**
 * Pre-app drop-offs from the owner's Google Sheet, before the first real
 * trackmyfilm.com entry on 2026-04-25.
 *
 * Computed 2026-10-14 from the public CSV export. DropOffCount is the last
 * column. Blank cells count as 0. The raw sum was 989. Obvious test and
 * placeholder rows (26 drop-offs) were excluded, leaving 963. Names, emails,
 * and dates are not stored.
 *
 * https://docs.google.com/spreadsheets/d/1Ib99Bd2g-_7YKpyOOA_Zb_CmvL772eOgjiiH6MSjG5E
 *
 * Legacy rolls = LEGACY_DROPOFF_COUNT × LEGACY_ROLLS_PER_DROPOFF (1444.5).
 * Display rounds half up to a whole number (1445). Add that only to all-time
 * "total film rolls developed" figures, never to a date range, a blank or
 * wholesale tally, or a turnaround average.
 */
export const LEGACY_DROPOFF_COUNT = 963;
export const LEGACY_ROLLS_PER_DROPOFF = 1.5;

/**
 * Sheet drop-offs from Jan 1 through Apr 24, 2026 only.
 * The first trackmyfilm.com order is Apr 25, so this fills that gap for the
 * public miles-saved figure. It is not added to roll totals. Names, emails,
 * and dates are not stored.
 */
export const LEGACY_2026_SHEET_DROPOFFS = 479;

export interface DevelopedRollSource {
  roll_count?: number | null;
  roll_details?: readonly unknown[] | null;
}

/** Exact legacy rolls before display rounding. */
export function legacyRollsExact(): number {
  return LEGACY_DROPOFF_COUNT * LEGACY_ROLLS_PER_DROPOFF;
}

/**
 * Whole pre-2026 rolls added to an all-time total.
 * 1444.5 rounds half up to 1445, matching Math.round on a positive half.
 */
export function legacyRollsRounded(): number {
  return Math.round(legacyRollsExact());
}

/** Physical rolls on the order. Roll details win; otherwise the stored count. */
export function rollsDevelopedOnOrder(order: DevelopedRollSource): number {
  if (order.roll_details && order.roll_details.length > 0) return order.roll_details.length;
  return order.roll_count || 0;
}

/** App rolls only. Does not include the pre-2026 estimate. */
export function countFilmRollsDeveloped(orders: readonly DevelopedRollSource[]): number {
  return orders.reduce((sum, order) => sum + rollsDevelopedOnOrder(order), 0);
}

/**
 * Total film rolls developed. Pass includeLegacy only for an all-time figure.
 * The result is a whole number: an integer app count plus 1444.5 rounds to
 * the app count plus 1445.
 */
export function totalFilmRollsDeveloped(
  orders: readonly DevelopedRollSource[],
  includeLegacy: boolean,
): number {
  const exact = countFilmRollsDeveloped(orders) + (includeLegacy ? legacyRollsExact() : 0);
  return Math.round(exact);
}
