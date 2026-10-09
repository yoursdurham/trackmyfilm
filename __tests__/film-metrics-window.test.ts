import { describe, expect, it } from "vitest";
import {
  FILM_METRICS_ORDER_SELECT,
  computeFilmMetrics,
  filmMetricsOrderOrFilter,
  orderAffectsFilmMetrics,
} from "@/lib/film-metrics";
import type { FilmOrder, RollDetail } from "@/lib/types";

const NOW = new Date("2026-10-08T19:00:00.000Z");
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
    status_updated_at: new Date(NOW.getTime() - 80 * DAY).toISOString(),
    film_type: "35mm",
    film_process: "Color",
    roll_count: 1,
    dropoff_date: "2026-01-01",
    dropoff_number: 1,
    created_at: new Date(NOW.getTime() - 80 * DAY).toISOString(),
    ...overrides,
  };
}

function rolls(process: RollDetail["film_process"], count: number): RollDetail[] {
  return Array.from({ length: count }, () => ({
    film_type: "35mm" as const,
    film_process: process,
    scan_size: "Standard" as const,
  }));
}

describe("orderAffectsFilmMetrics", () => {
  it("matches a full scan on the rows that can change the numbers", () => {
    const oldInProcess = makeOrder({
      id: "old-in-process",
      status: "Received by Yours",
      roll_count: 3,
      received_by_yours_at: "2026-01-02T16:00:00.000Z",
      created_at: "2026-01-02T16:00:00.000Z",
      status_updated_at: "2026-01-02T16:00:00.000Z",
    });
    const recentTurnaround = makeOrder({
      id: "recent-turnaround",
      status: "Scans Sent",
      roll_count: 3,
      roll_details: rolls("Color", 3),
      at_lab_at: new Date(NOW.getTime() - 14 * DAY).toISOString(),
      scans_sent_at: new Date(NOW.getTime() - 10 * DAY).toISOString(),
      status_updated_at: new Date(NOW.getTime() - 10 * DAY).toISOString(),
    });
    const boundary = makeOrder({
      id: "boundary-30",
      status: "Scans Sent",
      roll_count: 1,
      at_lab_at: new Date(NOW.getTime() - 32 * DAY).toISOString(),
      scans_sent_at: new Date(NOW.getTime() - 30 * DAY).toISOString(),
      status_updated_at: new Date(NOW.getTime() - 30 * DAY).toISOString(),
    });
    const justOutside = makeOrder({
      id: "outside-31",
      status: "Scans Sent",
      roll_count: 4,
      at_lab_at: new Date(NOW.getTime() - 34 * DAY).toISOString(),
      scans_sent_at: new Date(NOW.getTime() - 31 * DAY).toISOString(),
      status_updated_at: new Date(NOW.getTime() - 31 * DAY).toISOString(),
      created_at: new Date(NOW.getTime() - 40 * DAY).toISOString(),
      dropoff_date: "2026-08-20",
    });
    const ancient = makeOrder({
      id: "ancient",
      status: "Scans Sent",
      roll_count: 6,
      at_lab_at: new Date(NOW.getTime() - 64 * DAY).toISOString(),
      scans_sent_at: new Date(NOW.getTime() - 60 * DAY).toISOString(),
      status_updated_at: new Date(NOW.getTime() - 60 * DAY).toISOString(),
      created_at: new Date(NOW.getTime() - 70 * DAY).toISOString(),
      dropoff_date: "2026-07-01",
    });
    const receivedThisWeek = makeOrder({
      id: "received-week",
      status: "Ready for Pickup",
      roll_count: 2,
      received_by_yours_at: "2026-10-07T15:00:00.000Z",
      status_updated_at: "2026-10-07T15:00:00.000Z",
    });
    const dropoffOnly = makeOrder({
      id: "dropoff-only",
      status: "Ready for Pickup",
      roll_count: 1,
      dropoff_date: "2026-10-05",
      received_by_yours_at: undefined,
      created_at: "2026-01-01T16:00:00.000Z",
      status_updated_at: "2026-01-01T16:00:00.000Z",
    });
    const partialColor = makeOrder({
      id: "partial-color",
      status: "Ready for Pickup",
      film_process: "Both",
      roll_count: 2,
      roll_details: [...rolls("Color", 1), ...rolls("Black & White", 1)],
      at_lab_at: "2026-10-02T16:00:00.000Z",
      color_scans_delivered_at: "2026-10-06T16:00:00.000Z",
      status_updated_at: "2026-01-01T16:00:00.000Z",
    });
    const historyOnly = makeOrder({
      id: "history-only",
      status: "Scans Sent",
      roll_count: 1,
      scans_sent_at: undefined,
      at_lab_at: new Date(NOW.getTime() - 80 * DAY).toISOString(),
      status_updated_at: new Date(NOW.getTime() - 80 * DAY).toISOString(),
      status_history: [{ status: "Scans Sent", changed_at: NOW.toISOString() }],
    });

    const all = [
      oldInProcess,
      recentTurnaround,
      boundary,
      justOutside,
      ancient,
      receivedThisWeek,
      dropoffOnly,
      partialColor,
      historyOnly,
    ];

    expect(computeFilmMetrics(all.filter((order) => orderAffectsFilmMetrics(order, NOW)), NOW))
      .toEqual(computeFilmMetrics(all, NOW));

    expect(orderAffectsFilmMetrics(oldInProcess, NOW)).toBe(true);
    expect(orderAffectsFilmMetrics(recentTurnaround, NOW)).toBe(true);
    expect(orderAffectsFilmMetrics(boundary, NOW)).toBe(true);
    expect(orderAffectsFilmMetrics(historyOnly, NOW)).toBe(true);
    expect(orderAffectsFilmMetrics(ancient, NOW)).toBe(false);

    const withoutOld = all.filter((order) => order.id !== "old-in-process");
    expect(computeFilmMetrics(withoutOld, NOW).rollsProcessing)
      .not.toBe(computeFilmMetrics(all, NOW).rollsProcessing);

    const withoutHistory = all.filter((order) => order.id !== "history-only");
    expect(computeFilmMetrics(withoutHistory, NOW).scansSentToday)
      .not.toBe(computeFilmMetrics(all, NOW).scansSentToday);

    const filter = filmMetricsOrderOrFilter(NOW);
    expect(filter).toContain('status.eq."Received by Yours"');
    expect(filter).toContain('status.eq."Received at Lab"');
    expect(filter).toContain("status_updated_at.gte.");
    expect(filter).not.toMatch(/email|customer_name|order_number|notes/);
  });

  it("selects only the columns the metrics use", () => {
    expect(FILM_METRICS_ORDER_SELECT).not.toMatch(/email|customer_name|order_number|notes|wetransfer|phone/i);
    expect(FILM_METRICS_ORDER_SELECT.split(", ")).toEqual(expect.arrayContaining([
      "status",
      "roll_count",
      "roll_details",
      "film_process",
      "received_by_yours_at",
      "dropoff_date",
      "created_at",
      "at_lab_at",
      "scans_sent_at",
      "color_scans_delivered_at",
      "bw_scans_delivered_at",
      "status_history",
      "status_updated_at",
    ]));
  });
});
