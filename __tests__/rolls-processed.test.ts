import { describe, expect, it } from "vitest";
import { computePublicRollsProcessed, rollsProcessedOrderOrFilter } from "@/lib/film-metrics";
import { FILM_METRICS_ORDER_SELECT } from "@/lib/film-metrics";
import type { FilmOrder, RollDetail } from "@/lib/types";

const NOW = new Date("2026-10-27T15:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function makeOrder(overrides: Partial<FilmOrder> = {}): FilmOrder {
  return {
    id: "order-1",
    order_number: "TMF001",
    customer_id: "customer-1",
    customer_name: "Secret Customer",
    customer_email: "secret@example.com",
    status: "Scans Sent",
    status_history: [],
    status_updated_at: NOW.toISOString(),
    film_type: "35mm",
    film_process: "Color",
    roll_count: 1,
    dropoff_date: "2026-09-01",
    dropoff_number: 1,
    ...overrides,
  };
}

function rolls(process: RollDetail["film_process"], count: number, scan: RollDetail["scan_size"] = "Standard", blank = false): RollDetail[] {
  return Array.from({ length: count }, () => ({
    film_type: "35mm" as const,
    film_process: process,
    scan_size: scan,
    ...(blank ? { blank: true } : {}),
  }));
}

function sent(daysAgo: number): string {
  return new Date(NOW.getTime() - daysAgo * DAY).toISOString();
}

describe("computePublicRollsProcessed", () => {
  it("counts scanned rolls delivered in the rolling 30 days and nothing else", () => {
    const stats = computePublicRollsProcessed([
      makeOrder({
        id: "color",
        film_process: "Color",
        roll_count: 4,
        roll_details: rolls("Color", 4),
        scans_sent_at: sent(2),
      }),
      makeOrder({
        id: "bw",
        film_process: "Black & White",
        roll_count: 3,
        roll_details: rolls("Black & White", 3),
        scans_sent_at: sent(10),
      }),
      makeOrder({
        id: "old",
        film_process: "Color",
        roll_count: 8,
        roll_details: rolls("Color", 8),
        scans_sent_at: sent(31),
      }),
      makeOrder({
        id: "held",
        status: "On Hold",
        film_process: "Color",
        roll_count: 5,
        roll_details: rolls("Color", 5),
        scans_sent_at: sent(1),
      }),
      makeOrder({
        id: "blank-roll",
        film_process: "Color",
        roll_count: 3,
        roll_details: [...rolls("Color", 2), ...rolls("Color", 1, "Standard", true)],
        scans_sent_at: sent(1),
      }),
      makeOrder({
        id: "blank-only",
        film_process: "Color",
        roll_count: 2,
        roll_details: rolls("Color", 2, "Standard", true),
        scans_sent_at: sent(1),
      }),
      makeOrder({
        id: "future",
        film_process: "Color",
        roll_count: 2,
        roll_details: rolls("Color", 2),
        scans_sent_at: new Date(NOW.getTime() + DAY).toISOString(),
      }),
    ], NOW);

    expect(stats).toEqual({
      rolls: 9,
      windowDays: 30,
      updatedAt: "2026-10-27T15:00:00.000Z",
    });
    expect(JSON.stringify(stats)).not.toMatch(/secret|TMF001|email|customer/i);
  });

  it("counts each side of a mixed order when that side was delivered", () => {
    const stats = computePublicRollsProcessed([
      makeOrder({
        id: "mixed",
        film_process: "Both",
        roll_count: 3,
        roll_details: [...rolls("Color", 2), ...rolls("Black & White", 1)],
        color_scans_delivered_at: sent(5),
        bw_scans_delivered_at: sent(40),
        scans_sent_at: sent(5),
      }),
      makeOrder({
        id: "both-roll",
        film_process: "Both",
        roll_count: 3,
        roll_details: rolls("Both", 3),
        color_scans_delivered_at: sent(2),
        bw_scans_delivered_at: sent(12),
        scans_sent_at: sent(2),
      }),
    ], NOW);

    // Two color rolls in window, the black-and-white roll was delivered earlier.
    // Three Both rolls count once, on the first side delivered.
    expect(stats.rolls).toBe(5);
  });

  it("includes scans-only rolls and leaves process-only rolls out", () => {
    const stats = computePublicRollsProcessed([
      makeOrder({
        id: "scans-only",
        film_process: "Color",
        roll_count: 2,
        roll_details: rolls("Color", 2, "Scans Only"),
        scans_sent_at: sent(3),
      }),
      makeOrder({
        id: "process-only",
        status: "Ready for Pickup",
        film_process: "Black & White",
        roll_count: 4,
        roll_details: [...rolls("Black & White", 3, "Process Only"), ...rolls("Black & White", 1, "Process Only", true)],
        scans_sent_at: sent(1),
        status_history: [{ status: "Ready for Pickup", changed_at: sent(4) }],
        status_updated_at: sent(1),
      }),
      makeOrder({
        id: "process-waiting",
        status: "Received at Lab",
        film_process: "Color",
        roll_count: 3,
        roll_details: rolls("Color", 3, "Process Only"),
        at_lab_at: sent(6),
      }),
      makeOrder({
        id: "mixed-with-process-roll",
        film_process: "Color",
        roll_count: 3,
        roll_details: [...rolls("Color", 2, "Standard"), ...rolls("Color", 1, "Process Only")],
        scans_sent_at: sent(2),
      }),
    ], NOW);

    // 2 scans-only + 2 scanned rolls. Process Only orders and process-only rolls have no scans.
    expect(stats.rolls).toBe(4);
  });

  it("keeps a delivery exactly 30 days ago and drops the next millisecond", () => {
    const edge = new Date(NOW.getTime() - 30 * DAY);
    const kept = computePublicRollsProcessed([
      makeOrder({
        film_process: "Color",
        roll_count: 3,
        roll_details: rolls("Color", 3),
        scans_sent_at: edge.toISOString(),
      }),
    ], NOW);
    expect(kept.rolls).toBe(3);

    const dropped = computePublicRollsProcessed([
      makeOrder({
        film_process: "Color",
        roll_count: 3,
        roll_details: rolls("Color", 3),
        scans_sent_at: new Date(edge.getTime() - 1).toISOString(),
      }),
    ], NOW);
    expect(dropped.rolls).toBe(0);
  });

  it("reads scans sent from status history when the column is empty", () => {
    const stats = computePublicRollsProcessed([
      makeOrder({
        id: "history-scans",
        film_process: "Color",
        roll_count: 2,
        roll_details: rolls("Color", 2),
        scans_sent_at: undefined,
        status_history: [{ status: "Scans Sent", changed_at: sent(2) }],
      }),
      makeOrder({
        id: "history-ready",
        status: "Ready for Pickup",
        film_process: "Color",
        roll_count: 2,
        roll_details: rolls("Color", 2, "Process Only"),
        status_history: [{ status: "Ready for Pickup", changed_at: sent(6) }],
        status_updated_at: sent(1),
      }),
    ], NOW);
    expect(stats.rolls).toBe(2);
  });
});

describe("rolls processed order query", () => {
  it("uses the metrics columns and the 30-day finish window", () => {
    const filter = rollsProcessedOrderOrFilter(NOW);
    expect(filter).toContain("scans_sent_at.gte.2026-09-27T15:00:00.000Z");
    expect(filter).toContain("color_scans_delivered_at.gte.");
    expect(filter).toContain("bw_scans_delivered_at.gte.");
    expect(filter).toContain("status_updated_at.gte.");
    expect(filter).not.toMatch(/email|customer_name|order_number|notes|phone/i);
    expect(FILM_METRICS_ORDER_SELECT).not.toMatch(/email|customer_name|order_number|notes|wetransfer|phone/i);
  });
});
