import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getUrgentAgeDays, isLabDelayUrgent, isUrgent } from "../lib/order-urgency";
import type { FilmOrder } from "../lib/types";

function makeOrder(overrides: Partial<FilmOrder> = {}): FilmOrder {
  return {
    id: "order-1",
    order_number: "TMF001",
    customer_id: "customer-1",
    customer_name: "Test Customer",
    customer_email: "test@example.com",
    status: "Received at Lab",
    status_history: [],
    status_updated_at: new Date().toISOString(),
    film_type: "35mm",
    film_process: "Color",
    roll_count: 1,
    dropoff_date: "2026-05-26",
    dropoff_number: 1,
    ...overrides,
  };
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("isLabDelayUrgent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true when film has been at the lab for 8+ days", () => {
    expect(isLabDelayUrgent(makeOrder({ at_lab_at: daysAgo(8) }))).toBe(true);
    expect(isLabDelayUrgent(makeOrder({ at_lab_at: daysAgo(10) }))).toBe(true);
  });

  it("returns false when film has been at the lab for fewer than 8 days", () => {
    expect(isLabDelayUrgent(makeOrder({ at_lab_at: daysAgo(7) }))).toBe(false);
  });

  it("returns false for Received by Yours even when drop-off is 8+ days old", () => {
    const order = makeOrder({
      status: "Received by Yours",
      created_at: daysAgo(10),
      dropoff_date: "2026-06-01",
    });
    expect(isUrgent(order)).toBe(true);
    expect(isLabDelayUrgent(order)).toBe(false);
  });

  it("returns false for terminal statuses", () => {
    expect(isLabDelayUrgent(makeOrder({
      status: "Scans Sent",
      at_lab_at: daysAgo(10),
    }))).toBe(false);
  });

  it("uses legacy received_at_lab_at when at_lab_at is missing", () => {
    const order = makeOrder({ at_lab_at: undefined }) as FilmOrder & {
      received_at_lab_at?: string;
    };
    order.received_at_lab_at = daysAgo(9);
    expect(getUrgentAgeDays(order)).toBe(9);
    expect(isLabDelayUrgent(order)).toBe(true);
  });
});
