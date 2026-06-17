import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  calculateTurnaroundForPeriod,
  formatTurnaroundDays,
  getReceivedAtLabDate,
  getScansSentDate,
  getTurnaroundDays,
} from "../lib/turnaround-time";
import type { FilmOrder } from "../lib/types";

function makeOrder(overrides: Partial<FilmOrder> = {}): FilmOrder {
  return {
    id: "order-1",
    order_number: "TMF001",
    customer_id: "customer-1",
    customer_name: "Test Customer",
    customer_email: "test@example.com",
    status: "Scans Sent",
    status_history: [],
    status_updated_at: new Date().toISOString(),
    film_type: "35mm",
    film_process: "Color",
    roll_count: 1,
    dropoff_date: "2026-05-01",
    dropoff_number: 1,
    ...overrides,
  };
}

function isoDaysAgo(days: number, from = new Date("2026-06-17T12:00:00.000Z")) {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("turnaround-time", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses direct timestamp columns when available", () => {
    const order = makeOrder({
      at_lab_at: isoDaysAgo(10),
      scans_sent_at: isoDaysAgo(5),
    });

    expect(getReceivedAtLabDate(order)?.toISOString()).toBe(isoDaysAgo(10));
    expect(getScansSentDate(order)?.toISOString()).toBe(isoDaysAgo(5));
    expect(getTurnaroundDays(order)).toBe(5);
  });

  it("derives timestamps from status_history when columns are missing", () => {
    const order = makeOrder({
      at_lab_at: undefined,
      scans_sent_at: undefined,
      status_history: [
        { status: "Received by Yours", changed_at: isoDaysAgo(20) },
        { status: "Received at Lab", changed_at: isoDaysAgo(12) },
        { status: "Scans Sent", changed_at: isoDaysAgo(4) },
      ],
    });

    expect(getTurnaroundDays(order)).toBe(8);
  });

  it("excludes orders missing either timestamp", () => {
    const incomplete = makeOrder({
      status: "Received at Lab",
      at_lab_at: isoDaysAgo(10),
      scans_sent_at: undefined,
    });

    expect(getTurnaroundDays(incomplete)).toBeNull();

    const stats = calculateTurnaroundForPeriod([incomplete], "all");
    expect(stats.orderCount).toBe(0);
    expect(stats.averageDays).toBeNull();
  });

  it("calculates averages for the selected period by scans sent date", () => {
    const orders = [
      makeOrder({
        at_lab_at: isoDaysAgo(20),
        scans_sent_at: isoDaysAgo(15),
      }),
      makeOrder({
        at_lab_at: isoDaysAgo(8),
        scans_sent_at: isoDaysAgo(3),
      }),
      makeOrder({
        at_lab_at: isoDaysAgo(20),
        scans_sent_at: isoDaysAgo(10),
      }),
    ];

    expect(calculateTurnaroundForPeriod(orders, "all")).toEqual({
      orderCount: 3,
      averageDays: expect.closeTo(6.667, 2),
    });
    expect(calculateTurnaroundForPeriod(orders, "7d")).toEqual({
      orderCount: 1,
      averageDays: 5,
    });
    expect(calculateTurnaroundForPeriod(orders, "30d")).toEqual({
      orderCount: 3,
      averageDays: expect.closeTo(6.667, 2),
    });
  });

  it("formats turnaround to one decimal place", () => {
    expect(formatTurnaroundDays(5)).toBe("5.0 days");
    expect(formatTurnaroundDays(6.666)).toBe("6.7 days");
    expect(formatTurnaroundDays(null)).toBe("—");
  });
});
