import { describe, expect, it } from "vitest";
import { buildReportCsv, calculateReportMetrics } from "@/lib/report-metrics";
import {
  isBlankRoll,
  orderHasOnlyBlankRolls,
  rollDetailsWithBlankToggled,
} from "@/lib/blank-roll";
import type { FilmOrder, RollDetail } from "@/lib/types";

function order(overrides: Partial<FilmOrder> = {}): FilmOrder {
  return {
    id: "order-1",
    order_number: "JE1",
    customer_id: "cust-1",
    customer_name: "Ada",
    customer_email: "ada@example.com",
    status: "Scans Sent",
    status_history: [],
    status_updated_at: "2026-10-01T00:00:00.000Z",
    film_type: "35mm",
    film_process: "Color",
    roll_count: 1,
    dropoff_date: "2026-10-01",
    dropoff_number: 1,
    ...overrides,
  };
}

describe("blank roll flag", () => {
  const rolls: RollDetail[] = [
    { film_type: "35mm", film_process: "Color" },
    { film_type: "120", film_process: "Black & White", blank: true },
  ];

  it("treats a missing flag as a normal roll and toggles one roll at a time", () => {
    expect(isBlankRoll(rolls[0])).toBe(false);
    expect(isBlankRoll({})).toBe(false);
    expect(isBlankRoll(null)).toBe(false);

    const marked = rollDetailsWithBlankToggled(rolls, 0);
    expect(marked?.[0].blank).toBe(true);
    expect(marked?.[1].blank).toBe(true);

    const cleared = rollDetailsWithBlankToggled(marked ?? rolls, 1);
    expect(cleared?.[1].blank).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(cleared?.[1], "blank")).toBe(false);
    expect(rollDetailsWithBlankToggled(rolls, 4)).toBeNull();
  });

  it("calls an order blank-only only when every stored roll is blank", () => {
    expect(orderHasOnlyBlankRolls(order({ roll_details: undefined }))).toBe(false);
    expect(orderHasOnlyBlankRolls(order({
      roll_details: [{ film_type: "35mm", film_process: "Color", blank: true }],
    }))).toBe(true);
    expect(orderHasOnlyBlankRolls(order({ roll_details: rolls }))).toBe(false);
  });
});

describe("calculateReportMetrics", () => {
  it("counts blank rolls inside the existing totals and in their own split", () => {
    const metrics = calculateReportMetrics([
      order({
        customer_id: "cust-1",
        roll_count: 4,
        roll_details: [
          { film_type: "35mm", film_process: "Color", scan_size: "Standard", film_stock: "Portra 400", prints_4x6: true },
          { film_type: "35mm", film_process: "Color", scan_size: "High-Res", film_stock: "Portra 400", blank: true },
          { film_type: "120", film_process: "Black & White", scan_size: "TIFF", blank: true },
          { film_type: "110", film_process: "Both", blank: true },
        ],
      }),
      order({
        id: "legacy",
        customer_id: "cust-2",
        film_type: "35mm",
        film_process: "Color",
        roll_count: 2,
        roll_details: undefined,
      }),
      order({
        id: "disposable-blank",
        customer_id: "cust-1",
        roll_count: 1,
        roll_details: [
          { film_type: "Disposable Camera", film_process: "Color", blank: true },
        ],
      }),
    ]);

    expect(metrics.totalCustomers).toBe(2);
    expect(metrics.totalColorRolls).toBe(5);
    expect(metrics.totalBWRolls).toBe(1);
    expect(metrics.total35mmRolls).toBe(4);
    expect(metrics.total120Rolls).toBe(1);
    expect(metrics.total110Rolls).toBe(1);
    expect(metrics.total4x6Prints).toBe(1);
    expect(metrics.totalBlankRolls).toBe(4);
    expect(metrics.blankColorRolls).toBe(2);
    expect(metrics.blankBWRolls).toBe(1);
    expect(metrics.blankBothRolls).toBe(1);
    expect(metrics.blank35mmRolls).toBe(1);
    expect(metrics.blank120Rolls).toBe(1);
    expect(metrics.blank110Rolls).toBe(1);
    expect(metrics.blankOtherFormatRolls).toBe(1);
    expect(metrics.blankOtherProcessRolls).toBe(0);
    expect(metrics.filmStockUsage).toEqual([{ stock: "Portra 400", count: 2 }]);
    expect(metrics.scanResolutionUsage.map((item) => item.resolution)).toEqual([
      "Standard",
      "High-Res",
      "TIFF",
    ]);
  });

  it("writes blank columns into the monthly CSV", () => {
    const metrics = calculateReportMetrics([
      order({
        roll_details: [
          { film_type: "35mm", film_process: "Black & White", blank: true },
          { film_type: "120", film_process: "Color" },
        ],
      }),
    ]);
    const csv = buildReportCsv({
      generatedAt: "Oct 9, 2026",
      timeFrameLabel: "Last 30 days",
      metrics,
      averageTurnaroundDays: 4.26,
      completedOrders: 3,
    });

    expect(csv).toContain("Time frame: Last 30 days");
    expect(csv).toContain("Total B/W Rolls,1");
    expect(csv).toContain("Total Color Rolls,1");
    expect(csv).toContain("Total Blank Rolls,1");
    expect(csv).toContain("Blank Color Rolls,0");
    expect(csv).toContain("Blank B/W Rolls,1");
    expect(csv).toContain("Blank Both Rolls,0");
    expect(csv).toContain("Blank 35mm Rolls,1");
    expect(csv).toContain("Blank 120 Rolls,0");
    expect(csv).toContain("Blank 110 Rolls,0");
    expect(csv).toContain("Average Turnaround Time (days),4.3");
    expect(csv).toContain("Completed Orders (turnaround),3");
  });
});
