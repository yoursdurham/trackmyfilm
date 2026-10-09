import { describe, it, expect } from "vitest";
import {
  computeCustomerStats,
  getLatestOrderDate,
  sortCustomersByLatestOrder,
  sortCustomersByMostOrders,
  sortCustomersForList,
} from "../lib/customer-stats";
import { FILM_METRICS_CONFIG } from "../lib/film-metrics-config";
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
    // 35mm×2 vs 120×1 — tie broken by most recent order (Feb 120 roll)
    expect(stats.common_film_type).toBe("120");
    expect(stats.common_film_process).toBe("Black & White");
    expect(stats.average_turnaround_days).toBe(4);
  });

  it("leaves a 9.9-day order in the average and drops one of exactly 10 days", () => {
    const start = Date.parse("2026-01-01T10:00:00.000Z");
    const day = 24 * 60 * 60 * 1000;
    const stats = computeCustomerStats([
      baseOrder(),
      baseOrder({
        id: "order-fast",
        order_number: "JE1002",
        roll_count: 1,
        scans_sent_at: new Date(start + 9.9 * day).toISOString(),
      }),
      baseOrder({
        id: "order-slow",
        order_number: "JE1003",
        roll_count: 5,
        scans_sent_at: new Date(start + 10 * day).toISOString(),
      }),
    ]);

    expect(FILM_METRICS_CONFIG.maxTurnaroundDays).toBe(10);
    // 4 days and rounded 9.9 days. The 10-day order is omitted.
    // With that order included the average would round to 8.
    expect(stats.average_turnaround_days).toBe(7);
    expect(stats.total_orders).toBe(3);
    expect(stats.total_rolls).toBe(8);
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

  it("keeps blank rolls in the roll total and leaves an all-blank order out of the average", () => {
    const stats = computeCustomerStats([
      baseOrder({ roll_count: 2 }),
      baseOrder({
        id: "blank-order",
        order_number: "JE1009",
        roll_count: 3,
        scans_sent_at: "2026-01-09T10:00:00.000Z",
        roll_details: [
          { film_type: "35mm", film_process: "Color", blank: true },
          { film_type: "35mm", film_process: "Color", blank: true },
          { film_type: "120", film_process: "Black & White", blank: true },
        ],
      }),
    ]);

    expect(stats.total_orders).toBe(2);
    expect(stats.total_rolls).toBe(5);
    expect(stats.average_turnaround_days).toBe(4);
  });

  it("uses newest order by dropoff_date, then received_by_yours_at, then created_at", () => {
    expect(
      getLatestOrderDate([
        baseOrder({ dropoff_date: "2026-06-01" }),
        baseOrder({ id: "o2", dropoff_date: "2026-09-28" }),
      ])
    ).toBe("2026-09-28");

    expect(
      getLatestOrderDate([
        baseOrder({ dropoff_date: "", received_by_yours_at: "2026-08-01T10:00:00.000Z" }),
        baseOrder({
          id: "o2",
          dropoff_date: "",
          received_by_yours_at: "2026-09-01T10:00:00.000Z",
        }),
      ])
    ).toBe("2026-09-01T10:00:00.000Z");
  });
});

describe("sortCustomersByLatestOrder", () => {
  it("orders by latest order descending; no orders last; name tie-break", () => {
    const sorted = sortCustomersByLatestOrder([
      { first_name: "Chris", last_name: "Lee", last_order_date: "2026-06-12" },
      { first_name: "John", last_name: "May", last_order_date: "2026-09-28" },
      { first_name: "Alex", last_name: "Jones", last_order_date: "2026-08-30" },
      { first_name: "Sarah", last_name: "Smith", last_order_date: "2026-09-24" },
      { first_name: "No", last_name: "Orders", last_order_date: null },
    ]);

    expect(sorted.map((c) => c.first_name)).toEqual([
      "John",
      "Sarah",
      "Alex",
      "Chris",
      "No",
    ]);
  });
});

describe("sortCustomersByMostOrders", () => {
  it("orders by total orders desc, then latest order date", () => {
    const sorted = sortCustomersByMostOrders([
      { first_name: "A", total_orders: 5, last_order_date: "2026-01-01" },
      { first_name: "B", total_orders: 21, last_order_date: "2026-03-01" },
      { first_name: "C", total_orders: 9, last_order_date: "2026-06-01" },
      { first_name: "D", total_orders: 14, last_order_date: "2026-02-01" },
      { first_name: "E", total_orders: 5, last_order_date: "2026-08-01" },
      { first_name: "F", total_orders: 1, last_order_date: "2026-09-01" },
    ]);

    expect(sorted.map((c) => c.first_name)).toEqual(["B", "D", "C", "E", "A", "F"]);
  });

  it("sortCustomersForList respects mode", () => {
    const rows = [
      { first_name: "Low", total_orders: 1, last_order_date: "2026-09-01" },
      { first_name: "High", total_orders: 10, last_order_date: "2026-01-01" },
    ];
    expect(sortCustomersForList(rows, "most_orders").map((c) => c.first_name)).toEqual(["High", "Low"]);
    expect(sortCustomersForList(rows, "recent_order").map((c) => c.first_name)).toEqual(["Low", "High"]);
  });
});
