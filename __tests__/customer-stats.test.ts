import { describe, it, expect } from "vitest";
import { computeCustomerStats } from "../lib/customer-stats";
import type { FilmOrder } from "../lib/types";

const baseOrder = (overrides: Partial<FilmOrder> = {}): FilmOrder => ({
  id: "order-1",
  order_number: "JE1001",
  customer_id: "cust-1",
  customer_name: "Jane Doe",
  customer_email: "jane@example.com",
  status: "Scans Sent",
  status_history: [],
  status_updated_at: "2026-01-10T12:00:00.000Z",
  film_type: "35mm",
  film_process: "Color",
  roll_count: 2,
  dropoff_date: "2026-01-01",
  dropoff_number: 1,
  received_by_yours_at: "2026-01-01T10:00:00.000Z",
  scans_sent_at: "2026-01-05T10:00:00.000Z",
  ...overrides,
});

describe("computeCustomerStats", () => {
  it("returns zeros for empty order list", () => {
    expect(computeCustomerStats([])).toEqual({
      total_orders: 0,
      total_rolls: 0,
      last_order_date: null,
      average_turnaround_days: null,
      common_film_type: null,
      common_film_process: null,
      common_scan_size: null,
    });
  });

  it("derives totals and common values from orders", () => {
    const stats = computeCustomerStats([
      baseOrder(),
      baseOrder({
        id: "order-2",
        order_number: "JE1002",
        dropoff_date: "2026-02-01",
        roll_count: 1,
        film_process: "Black & White",
        roll_details: [{ film_type: "120", film_process: "Black & White", scan_size: "High-Res" }],
      }),
    ]);

    expect(stats.total_orders).toBe(2);
    expect(stats.total_rolls).toBe(3);
    expect(stats.last_order_date).toBe("2026-02-01");
    expect(stats.common_film_type).toBe("35mm");
    expect(stats.common_film_process).toBe("Color");
    expect(stats.average_turnaround_days).toBe(4);
  });

  it("counts 110 film type from roll_details", () => {
    const stats = computeCustomerStats([
      baseOrder({
        roll_details: [
          { film_type: "110", film_process: "Color", scan_size: "Standard" },
          { film_type: "110", film_process: "Color", scan_size: "Standard" },
        ],
      }),
      baseOrder({
        id: "order-2",
        order_number: "JE1002",
        roll_details: [{ film_type: "35mm", film_process: "Color", scan_size: "Standard" }],
      }),
    ]);

    expect(stats.common_film_type).toBe("110");
  });
});
