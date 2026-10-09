import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { FILM_METRICS_CONFIG } from "../lib/film-metrics-config";
import {
  calculateTurnaroundForDateRange,
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

    // The third order is exactly 10 days (20 → 10 days ago) and is left out.
    // Before that cutoff the all/30-day average was 6.667 days across 3 orders.
    expect(calculateTurnaroundForPeriod(orders, "all")).toEqual({
      orderCount: 2,
      averageDays: 5,
    });
    expect(calculateTurnaroundForPeriod(orders, "7d")).toEqual({
      orderCount: 1,
      averageDays: 5,
    });
    expect(calculateTurnaroundForPeriod(orders, "30d")).toEqual({
      orderCount: 2,
      averageDays: 5,
    });
  });

  it("keeps a 9.9-day turnaround and drops one of exactly 10 days", () => {
    const now = new Date("2026-06-17T12:00:00.000Z");
    const day = 24 * 60 * 60 * 1000;
    const included = makeOrder({
      id: "just-under",
      at_lab_at: new Date(now.getTime() - 9.9 * day).toISOString(),
      scans_sent_at: now.toISOString(),
    });
    const excluded = makeOrder({
      id: "at-cutoff",
      at_lab_at: new Date(now.getTime() - 10 * day).toISOString(),
      scans_sent_at: now.toISOString(),
    });

    expect(FILM_METRICS_CONFIG.maxTurnaroundDays).toBe(10);
    expect(getTurnaroundDays(included)).toBeCloseTo(9.9, 5);
    expect(getTurnaroundDays(excluded)).toBe(10);
    expect(calculateTurnaroundForPeriod([included, excluded], "all")).toEqual({
      orderCount: 1,
      averageDays: expect.closeTo(9.9, 5),
    });
    expect(calculateTurnaroundForDateRange(
      [included, excluded],
      new Date(now.getTime() - day),
      now,
    )).toEqual({
      orderCount: 1,
      averageDays: expect.closeTo(9.9, 5),
    });
  });

  it("calculates turnaround for a custom scans-sent date range", () => {
    const orders = [
      makeOrder({
        at_lab_at: isoDaysAgo(10),
        scans_sent_at: isoDaysAgo(5),
      }),
      makeOrder({
        id: "order-2",
        at_lab_at: isoDaysAgo(40),
        scans_sent_at: isoDaysAgo(35),
      }),
    ];

    const start = new Date(isoDaysAgo(7));
    const end = new Date(isoDaysAgo(0));

    expect(calculateTurnaroundForDateRange(orders, start, end)).toEqual({
      orderCount: 1,
      averageDays: 5,
    });
  });

  it("leaves an all-blank order out of the average and keeps a mixed order", () => {
    const blankOnly = makeOrder({
      id: "blank-only",
      at_lab_at: isoDaysAgo(10),
      scans_sent_at: isoDaysAgo(4),
      roll_count: 2,
      roll_details: [
        { film_type: "35mm", film_process: "Color", blank: true },
        { film_type: "35mm", film_process: "Black & White", blank: true },
      ],
    });
    const mixed = makeOrder({
      id: "mixed",
      at_lab_at: isoDaysAgo(8),
      scans_sent_at: isoDaysAgo(4),
      roll_count: 2,
      roll_details: [
        { film_type: "35mm", film_process: "Color", blank: true },
        { film_type: "120", film_process: "Color" },
      ],
    });
    const plain = makeOrder({
      id: "plain",
      at_lab_at: isoDaysAgo(9),
      scans_sent_at: isoDaysAgo(3),
    });

    expect(calculateTurnaroundForPeriod([blankOnly, mixed, plain], "all")).toEqual({
      orderCount: 2,
      averageDays: 5,
    });
  });

  it("formats turnaround to one decimal place", () => {
    expect(formatTurnaroundDays(5)).toBe("5.0 days");
    expect(formatTurnaroundDays(6.666)).toBe("6.7 days");
    expect(formatTurnaroundDays(null)).toBe("—");
  });
});
