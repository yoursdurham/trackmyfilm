import { isBlankRoll } from "./blank-roll";
import { ORDER_STATUS } from "./constants";
import type { FilmOrder, RollDetail } from "./types";

export interface ReportMetrics {
  totalCustomers: number;
  totalBWRolls: number;
  totalColorRolls: number;
  total35mmRolls: number;
  total120Rolls: number;
  total110Rolls: number;
  total4x6Prints: number;
  totalBlankRolls: number;
  blankColorRolls: number;
  blankBWRolls: number;
  blankBothRolls: number;
  blankOtherProcessRolls: number;
  blank35mmRolls: number;
  blank120Rolls: number;
  blank110Rolls: number;
  blankOtherFormatRolls: number;
  filmStockUsage: { stock: string; count: number }[];
  scanResolutionUsage: { resolution: string; count: number }[];
  /** Parked orders. Their rolls stay in the volume totals; they are not completed. */
  onHoldOrders: number;
  onHoldRolls: number;
}

function emptyMetrics(): Omit<
  ReportMetrics,
  "totalCustomers" | "filmStockUsage" | "scanResolutionUsage" | "onHoldOrders" | "onHoldRolls"
> {
  return {
    totalBWRolls: 0,
    totalColorRolls: 0,
    total35mmRolls: 0,
    total120Rolls: 0,
    total110Rolls: 0,
    total4x6Prints: 0,
    totalBlankRolls: 0,
    blankColorRolls: 0,
    blankBWRolls: 0,
    blankBothRolls: 0,
    blankOtherProcessRolls: 0,
    blank35mmRolls: 0,
    blank120Rolls: 0,
    blank110Rolls: 0,
    blankOtherFormatRolls: 0,
  };
}

function tallyRoll(
  roll: Pick<RollDetail, "film_process" | "film_type" | "prints_4x6" | "film_stock" | "scan_size" | "blank">,
  totals: ReturnType<typeof emptyMetrics>,
  filmStockMap: Map<string, number>,
  scanResolutionMap: Map<string, number>,
) {
  const blank = isBlankRoll(roll);
  if (roll.film_process === "Black & White") totals.totalBWRolls += 1;
  if (roll.film_process === "Color") totals.totalColorRolls += 1;
  if (roll.film_type === "35mm") totals.total35mmRolls += 1;
  if (roll.film_type === "120") totals.total120Rolls += 1;
  if (roll.film_type === "110") totals.total110Rolls += 1;
  if (roll.prints_4x6) totals.total4x6Prints += 1;
  if (roll.film_stock) {
    filmStockMap.set(roll.film_stock, (filmStockMap.get(roll.film_stock) || 0) + 1);
  }
  if (roll.scan_size) {
    scanResolutionMap.set(roll.scan_size, (scanResolutionMap.get(roll.scan_size) || 0) + 1);
  }
  if (!blank) return;

  totals.totalBlankRolls += 1;
  if (roll.film_process === "Color") totals.blankColorRolls += 1;
  else if (roll.film_process === "Black & White") totals.blankBWRolls += 1;
  else if (roll.film_process === "Both") totals.blankBothRolls += 1;
  else totals.blankOtherProcessRolls += 1;

  if (roll.film_type === "35mm") totals.blank35mmRolls += 1;
  else if (roll.film_type === "120") totals.blank120Rolls += 1;
  else if (roll.film_type === "110") totals.blank110Rolls += 1;
  else totals.blankOtherFormatRolls += 1;
}

function tallyLegacyOrder(
  order: FilmOrder,
  totals: ReturnType<typeof emptyMetrics>,
  filmStockMap: Map<string, number>,
) {
  const count = order.roll_count || 0;
  if (order.film_process === "Black & White") totals.totalBWRolls += count;
  if (order.film_process === "Color") totals.totalColorRolls += count;
  if (order.film_type === "35mm") totals.total35mmRolls += count;
  if (order.film_type === "120") totals.total120Rolls += count;
  if (order.film_type === "110") totals.total110Rolls += count;
  if (order.prints_4x6) totals.total4x6Prints += count;
  if (order.film_stock) {
    filmStockMap.set(order.film_stock, (filmStockMap.get(order.film_stock) || 0) + count);
  }
}

function rollsRepresented(order: FilmOrder): number {
  if (order.roll_details && order.roll_details.length > 0) return order.roll_details.length;
  return order.roll_count || 0;
}

export function calculateReportMetrics(orderList: FilmOrder[]): ReportMetrics {
  const uniqueCustomerIds = new Set<string>();
  const filmStockMap = new Map<string, number>();
  const scanResolutionMap = new Map<string, number>();
  const totals = emptyMetrics();
  let onHoldOrders = 0;
  let onHoldRolls = 0;

  orderList.forEach((order) => {
    uniqueCustomerIds.add(order.customer_id);
    if (order.status === ORDER_STATUS.ON_HOLD) {
      onHoldOrders += 1;
      onHoldRolls += rollsRepresented(order);
    }

    if (order.roll_details && order.roll_details.length > 0) {
      order.roll_details.forEach((roll) => {
        tallyRoll(roll, totals, filmStockMap, scanResolutionMap);
      });
    } else {
      tallyLegacyOrder(order, totals, filmStockMap);
    }
  });

  const filmStockUsage = Array.from(filmStockMap.entries())
    .map(([stock, count]) => ({ stock, count }))
    .sort((a, b) => b.count - a.count);

  const scanResolutionUsage = Array.from(scanResolutionMap.entries())
    .map(([resolution, count]) => ({ resolution, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalCustomers: uniqueCustomerIds.size,
    ...totals,
    filmStockUsage,
    scanResolutionUsage,
    onHoldOrders,
    onHoldRolls,
  };
}

export function buildReportCsv(args: {
  generatedAt: string;
  timeFrameLabel: string;
  metrics: ReportMetrics;
  averageTurnaroundDays: number | null;
  completedOrders: number;
}): string {
  const turnaround =
    args.averageTurnaroundDays !== null
      ? (Math.round(args.averageTurnaroundDays * 10) / 10).toFixed(1)
      : "";
  const { metrics } = args;

  return [
    "TrackMyFilm Report",
    `Generated: ${args.generatedAt}`,
    `Time frame: ${args.timeFrameLabel}`,
    "",
    "METRICS",
    `Total Individual Customers,${metrics.totalCustomers}`,
    `Total B/W Rolls,${metrics.totalBWRolls}`,
    `Total Color Rolls,${metrics.totalColorRolls}`,
    `Total 35mm Rolls,${metrics.total35mmRolls}`,
    `Total 120 Rolls,${metrics.total120Rolls}`,
    `Total 110 Rolls,${metrics.total110Rolls}`,
    `Total 4x6" Prints Done,${metrics.total4x6Prints}`,
    `Total Blank Rolls,${metrics.totalBlankRolls}`,
    `Blank Color Rolls,${metrics.blankColorRolls}`,
    `Blank B/W Rolls,${metrics.blankBWRolls}`,
    `Blank Both Rolls,${metrics.blankBothRolls}`,
    `Blank Other Process Rolls,${metrics.blankOtherProcessRolls}`,
    `Blank 35mm Rolls,${metrics.blank35mmRolls}`,
    `Blank 120 Rolls,${metrics.blank120Rolls}`,
    `Blank 110 Rolls,${metrics.blank110Rolls}`,
    `Blank Other Format Rolls,${metrics.blankOtherFormatRolls}`,
    `Average Turnaround Time (days),${turnaround}`,
    `Completed Orders (turnaround),${args.completedOrders}`,
    `On Hold Orders (parked; not completed),${args.metrics.onHoldOrders}`,
    `On Hold Rolls (included in the roll totals above; not completed),${args.metrics.onHoldRolls}`,
    "",
    "FILM STOCK USAGE",
    "Film Stock,Count",
    ...metrics.filmStockUsage.map((fs) => `${fs.stock},${fs.count}`),
    "",
    "SCAN RESOLUTION USAGE",
    "Resolution,Count",
    ...metrics.scanResolutionUsage.map((sr) => `${sr.resolution},${sr.count}`),
  ].join("\n");
}
