import { describe, expect, it } from "vitest";
import { computeFilmMetrics, computePublicTurnaround, turnaroundOrderOrFilter } from "@/lib/film-metrics";
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

function rolls(process: RollDetail["film_process"], count: number, blank = false): RollDetail[] {
  return Array.from({ length: count }, () => ({
    film_type: "35mm" as const,
    film_process: process,
    scan_size: "Standard" as const,
    ...(blank ? { blank: true } : {}),
  }));
}

function sentOrder(partial: Partial<FilmOrder>, days: number, sentDaysAgo: number): FilmOrder {
  const sent = new Date(NOW.getTime() - sentDaysAgo * DAY);
  return makeOrder({
    scans_sent_at: sent.toISOString(),
    at_lab_at: new Date(sent.getTime() - days * DAY).toISOString(),
    ...partial,
  });
}

describe("computePublicTurnaround", () => {
  const sampleOrders = [
    sentOrder({ id: "color-a", film_process: "Color", roll_count: 4 }, 4, 1),
    sentOrder({ id: "color-b", film_process: "Color", roll_count: 2 }, 6, 2),
    sentOrder({ id: "bw-a", film_process: "Black & White", roll_count: 3 }, 3, 3),
    sentOrder({ id: "bw-b", film_process: "Black & White", roll_count: 3 }, 9, 4),
    sentOrder({ id: "held", status: "On Hold", film_process: "Color", roll_count: 5 }, 2, 1),
    sentOrder({
      id: "blank",
      film_process: "Color",
      roll_count: 4,
      roll_details: rolls("Color", 4, true),
    }, 1, 1),
    sentOrder({ id: "outlier", film_process: "Color", roll_count: 3 }, 10, 1),
    sentOrder({ id: "old", film_process: "Color", roll_count: 10 }, 2, 31),
    sentOrder({ id: "backwards", film_process: "Color", roll_count: 4 }, -1, 1),
    makeOrder({
      id: "still-at-lab",
      status: "Received at Lab",
      film_process: "Color",
      roll_count: 3,
      at_lab_at: new Date(NOW.getTime() - 6 * DAY).toISOString(),
    }),
  ];

  it("returns the roll-weighted 30-day lab-to-scans figure and nothing else", () => {
    const stats = computePublicTurnaround(sampleOrders, NOW);
    expect(stats).toEqual({
      avgDays: 5.3,
      pctWithin8Days: 75,
      color: { avgDays: 4.7 },
      bw: { avgDays: 6 },
      windowDays: 30,
      updatedAt: "2026-10-27T15:00:00.000Z",
    });
    expect(JSON.stringify(stats)).not.toMatch(/secret|TMF001|email|customer/i);

    const metrics = computeFilmMetrics(sampleOrders, NOW);
    expect(stats.color.avgDays).toBe(metrics.averageColorTurnaroundDays);
    expect(stats.bw.avgDays).toBe(metrics.averageBwTurnaroundDays);
  });

  it("times each side of a mixed order and counts that order once", () => {
    const sent = new Date(NOW.getTime() - 2 * DAY);
    const orders = [
      makeOrder({
        id: "mixed",
        film_process: "Both",
        roll_count: 4,
        roll_details: [...rolls("Color", 2), ...rolls("Black & White", 2)],
        at_lab_at: new Date(sent.getTime() - 6 * DAY).toISOString(),
        color_scans_delivered_at: new Date(sent.getTime() - 2 * DAY).toISOString(),
        bw_scans_delivered_at: sent.toISOString(),
        scans_sent_at: sent.toISOString(),
      }),
      sentOrder({ id: "color-fill", film_process: "Color", roll_count: 3 }, 4, 1),
      sentOrder({ id: "bw-fill", film_process: "Black & White", roll_count: 3 }, 4, 1),
    ];
    const stats = computePublicTurnaround(orders, NOW);
    const metrics = computeFilmMetrics(orders, NOW);
    // Color: (2×4 + 3×4) / 5 = 4. Black & white: (2×6 + 3×4) / 5 = 4.8.
    // The mixed order's slower side is 6 days, so it still counts as within 8.
    expect(stats.color.avgDays).toBe(4);
    expect(stats.bw.avgDays).toBe(4.8);
    expect(stats.avgDays).toBe(4.4);
    expect(stats.pctWithin8Days).toBe(100);
    expect(stats.color.avgDays).toBe(metrics.averageColorTurnaroundDays);
    expect(stats.bw.avgDays).toBe(metrics.averageBwTurnaroundDays);
  });

  it("weights a both roll on each side and rounds the eight-day share", () => {
    const sent = new Date(NOW.getTime() - 1 * DAY);
    const both = makeOrder({
      id: "both",
      film_process: "Both",
      roll_count: 3,
      roll_details: rolls("Both", 3),
      at_lab_at: new Date(sent.getTime() - 8 * DAY).toISOString(),
      color_scans_delivered_at: new Date(sent.getTime() - 4 * DAY).toISOString(),
      bw_scans_delivered_at: sent.toISOString(),
      scans_sent_at: sent.toISOString(),
    });
    const alone = computePublicTurnaround([both], NOW);
    expect(alone.color.avgDays).toBe(4);
    expect(alone.bw.avgDays).toBe(8);
    expect(alone.avgDays).toBe(6);
    expect(alone.pctWithin8Days).toBeNull();

    const twoMore = [
      both,
      sentOrder({ id: "fast", film_process: "Color", roll_count: 1 }, 2, 1),
      sentOrder({ id: "slow", film_process: "Color", roll_count: 1 }, 9, 1),
    ];
    expect(computePublicTurnaround(twoMore, NOW).pctWithin8Days).toBe(67);
  });

  it("returns null averages and a null percentage below three samples", () => {
    const stats = computePublicTurnaround([
      sentOrder({ id: "one", film_process: "Color", roll_count: 1 }, 4, 1),
      sentOrder({ id: "two", film_process: "Color", roll_count: 1 }, 6, 1),
    ], NOW);
    expect(stats.avgDays).toBeNull();
    expect(stats.color.avgDays).toBeNull();
    expect(stats.bw.avgDays).toBeNull();
    expect(stats.pctWithin8Days).toBeNull();
  });

  it("keeps a scan sent exactly 30 days ago and drops the next millisecond", () => {
    const edge = new Date(NOW.getTime() - 30 * DAY);
    const kept = computePublicTurnaround([
      makeOrder({
        id: "edge",
        film_process: "Color",
        roll_count: 3,
        scans_sent_at: edge.toISOString(),
        at_lab_at: new Date(edge.getTime() - 5 * DAY).toISOString(),
      }),
    ], NOW);
    expect(kept.avgDays).toBe(5);

    const dropped = computePublicTurnaround([
      makeOrder({
        id: "past",
        film_process: "Color",
        roll_count: 3,
        scans_sent_at: new Date(edge.getTime() - 1).toISOString(),
        at_lab_at: new Date(edge.getTime() - 1 - 5 * DAY).toISOString(),
      }),
    ], NOW);
    expect(dropped.avgDays).toBeNull();
  });
});

describe("turnaround order query", () => {
  it("asks for the metrics columns and the 30-day finish window", () => {
    const filter = turnaroundOrderOrFilter(NOW);
    expect(filter).toContain("scans_sent_at.gte.2026-09-27T15:00:00.000Z");
    expect(filter).toContain("color_scans_delivered_at.gte.");
    expect(filter).toContain("bw_scans_delivered_at.gte.");
    expect(filter).toContain("status_updated_at.gte.");
    expect(filter).not.toMatch(/email|customer_name|order_number|notes|phone/i);
    expect(FILM_METRICS_ORDER_SELECT).not.toMatch(/email|customer_name|order_number|notes|wetransfer|phone/i);
  });
});
