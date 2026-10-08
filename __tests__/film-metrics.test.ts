import { describe, expect, it } from "vitest";
import { computeFilmMetrics, nextLabRunLabel } from "@/lib/film-metrics";
import { FILM_METRICS_CONFIG } from "@/lib/film-metrics-config";
import type { FilmOrder, RollDetail } from "@/lib/types";

const NOW = new Date("2026-10-08T19:00:00.000Z"); // Thursday Oct 8, 2026, 3:00 PM EDT
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

function rolls(process: RollDetail["film_process"], count: number, scan: RollDetail["scan_size"] = "Standard"): RollDetail[] {
  return Array.from({ length: count }, () => ({
    film_type: "35mm" as const,
    film_process: process,
    scan_size: scan,
  }));
}

describe("next lab run", () => {
  it("names the next Tuesday or Friday at noon, and says Today until noon passes", () => {
    expect(nextLabRunLabel(new Date("2026-10-08T19:00:00.000Z"))).toBe("Friday 12:00 PM");
    expect(nextLabRunLabel(new Date("2026-10-09T15:00:00.000Z"))).toBe("Today 12:00 PM");
    expect(nextLabRunLabel(new Date("2026-10-09T16:00:00.000Z"))).toBe("Today 12:00 PM");
    expect(nextLabRunLabel(new Date("2026-10-09T16:00:01.000Z"))).toBe("Tuesday 12:00 PM");
    expect(nextLabRunLabel(new Date("2026-10-06T15:00:00.000Z"))).toBe("Today 12:00 PM");
    expect(nextLabRunLabel(new Date("2026-10-06T16:01:00.000Z"))).toBe("Friday 12:00 PM");
    expect(nextLabRunLabel(new Date("2026-10-10T14:00:00.000Z"))).toBe("Tuesday 12:00 PM");
    expect(nextLabRunLabel(new Date("2026-10-11T16:00:00.000Z"))).toBe("Tuesday 12:00 PM");
    expect(nextLabRunLabel(new Date("2026-10-12T16:00:00.000Z"))).toBe("Tuesday 12:00 PM");
  });

  it("uses America/New_York in winter, when the offset is five hours", () => {
    expect(nextLabRunLabel(new Date("2026-01-16T16:30:00.000Z"))).toBe("Today 12:00 PM");
    expect(nextLabRunLabel(new Date("2026-01-16T17:01:00.000Z"))).toBe("Tuesday 12:00 PM");
  });
});

describe("computeFilmMetrics", () => {
  it("counts rolls in house or at the lab, and ignores delivered orders", () => {
    const metrics = computeFilmMetrics([
      makeOrder({ id: "a", status: "Received by Yours", roll_count: 3, film_process: "Color" }),
      makeOrder({
        id: "b",
        status: "Received at Lab",
        roll_count: 9,
        roll_details: rolls("Black & White", 2),
      }),
      makeOrder({ id: "c", status: "Ready for Pickup", roll_count: 4 }),
      makeOrder({ id: "d", status: "Scans Sent", roll_count: 8 }),
    ], NOW);

    expect(metrics.rollsProcessing).toBe(5);
  });

  it("buckets received rolls by the New York calendar day and a Sunday week", () => {
    const metrics = computeFilmMetrics([
      makeOrder({
        id: "today",
        status: "Received by Yours",
        roll_count: 4,
        received_by_yours_at: "2026-10-08T04:30:00.000Z", // 12:30 AM EDT Thursday
      }),
      makeOrder({
        id: "late-wednesday",
        status: "Received by Yours",
        roll_count: 2,
        received_by_yours_at: "2026-10-08T03:30:00.000Z", // 11:30 PM EDT Wednesday
        dropoff_date: "2026-10-08",
      }),
      makeOrder({
        id: "sunday",
        status: "Received at Lab",
        roll_count: 1,
        received_by_yours_at: "2026-10-04T04:30:00.000Z", // 12:30 AM EDT Sunday
      }),
      makeOrder({
        id: "saturday",
        status: "Scans Sent",
        roll_count: 6,
        received_by_yours_at: "2026-10-04T03:59:00.000Z", // 11:59 PM EDT Saturday
      }),
      makeOrder({
        id: "dropoff-only",
        status: "Received by Yours",
        roll_count: 1,
        dropoff_date: "2026-10-08",
        received_by_yours_at: undefined,
        created_at: "2026-09-01T12:00:00.000Z",
      }),
    ], NOW);

    expect(metrics.receivedToday).toBe(5);
    expect(metrics.receivedThisWeek).toBe(8);
  });

  it("keeps the same Sunday week when New York is on standard time", () => {
    const winter = new Date("2026-01-15T05:30:00.000Z"); // Thursday Jan 15, 12:30 AM EST
    const metrics = computeFilmMetrics([
      makeOrder({
        id: "still-wednesday",
        status: "Received by Yours",
        roll_count: 2,
        received_by_yours_at: "2026-01-15T04:30:00.000Z", // 11:30 PM EST Wednesday
      }),
      makeOrder({
        id: "sunday",
        status: "Received by Yours",
        roll_count: 1,
        received_by_yours_at: "2026-01-11T05:00:00.000Z", // midnight EST Sunday
      }),
      makeOrder({
        id: "saturday",
        status: "Received by Yours",
        roll_count: 3,
        received_by_yours_at: "2026-01-11T04:30:00.000Z", // 11:30 PM EST Saturday
      }),
    ], winter);

    expect(metrics.receivedToday).toBe(0);
    expect(metrics.receivedThisWeek).toBe(3);
    expect(metrics.nextLabRun).toBe("Friday 12:00 PM");
  });

  it("counts mixed-order scans from each side's delivery time, otherwise scans sent", () => {
    const metrics = computeFilmMetrics([
      makeOrder({
        id: "mixed",
        status: "Received at Lab",
        film_process: "Both",
        roll_count: 3,
        roll_details: [...rolls("Color", 2), ...rolls("Black & White", 1)],
        color_scans_delivered_at: "2026-10-08T15:00:00.000Z",
        bw_scans_delivered_at: "2026-10-01T15:00:00.000Z",
      }),
      makeOrder({
        id: "color-only",
        status: "Scans Sent",
        film_process: "Color",
        roll_count: 2,
        scans_sent_at: "2026-10-08T18:00:00.000Z",
        at_lab_at: "2026-10-04T18:00:00.000Z",
      }),
      makeOrder({
        id: "both-roll",
        status: "Received at Lab",
        film_process: "Both",
        roll_count: 1,
        roll_details: rolls("Both", 1),
        color_scans_delivered_at: "2026-10-08T14:00:00.000Z",
        bw_scans_delivered_at: "2026-10-07T14:00:00.000Z",
      }),
    ], NOW);

    expect(metrics.scansSentToday).toBe(4);
    expect(metrics.scansSentThisWeek).toBe(5);
  });

  it("splits a Both order with no roll details in half and does not double-count scans", () => {
    const sent = new Date(NOW.getTime() - 6 * DAY).toISOString();
    const atLab = new Date(NOW.getTime() - 10 * DAY).toISOString();
    const metrics = computeFilmMetrics([
      makeOrder({
        film_process: "Both",
        roll_count: 5,
        roll_details: undefined,
        scans_sent_at: sent,
        at_lab_at: atLab,
      }),
    ], NOW);

    expect(metrics.scansSentThisWeek).toBe(0);
    expect(metrics.averageColorTurnaroundDays).toBe(4);
    expect(metrics.averageBwTurnaroundDays).toBeNull();
  });

  it("uses scans sent for both sides when a mixed order has no side timestamps", () => {
    const sent = new Date(NOW.getTime() - 2 * DAY);
    const atLab = new Date(sent.getTime() - 6 * DAY);
    const metrics = computeFilmMetrics([
      makeOrder({
        film_process: "Both",
        roll_count: 6,
        scans_sent_at: sent.toISOString(),
        at_lab_at: atLab.toISOString(),
      }),
    ], NOW);

    expect(metrics.scansSentToday).toBe(0);
    expect(metrics.scansSentThisWeek).toBe(6);
    expect(metrics.averageColorTurnaroundDays).toBe(6);
    expect(metrics.averageBwTurnaroundDays).toBe(6);
  });

  it("weights turnaround by rolls and omits a side without enough completed rolls", () => {
    const sentA = new Date(NOW.getTime() - 2 * DAY);
    const sentB = new Date(NOW.getTime() - 3 * DAY);
    const metrics = computeFilmMetrics([
      makeOrder({
        id: "color-a",
        film_process: "Color",
        roll_count: 2,
        scans_sent_at: sentA.toISOString(),
        at_lab_at: new Date(sentA.getTime() - 4 * DAY).toISOString(),
      }),
      makeOrder({
        id: "color-b",
        film_process: "Color",
        roll_count: 2,
        scans_sent_at: sentB.toISOString(),
        at_lab_at: new Date(sentB.getTime() - 8 * DAY).toISOString(),
      }),
      makeOrder({
        id: "bw-short",
        film_process: "Black & White",
        roll_count: 2,
        scans_sent_at: sentA.toISOString(),
        at_lab_at: new Date(sentA.getTime() - 5 * DAY).toISOString(),
      }),
      makeOrder({
        id: "old",
        film_process: "Color",
        roll_count: 10,
        scans_sent_at: new Date(NOW.getTime() - 40 * DAY).toISOString(),
        at_lab_at: new Date(NOW.getTime() - 45 * DAY).toISOString(),
      }),
      makeOrder({
        id: "backwards",
        film_process: "Color",
        roll_count: 4,
        scans_sent_at: new Date(NOW.getTime() - 1 * DAY).toISOString(),
        at_lab_at: NOW.toISOString(),
      }),
      makeOrder({
        id: "develop-only",
        status: "Ready for Pickup",
        film_process: "Color",
        roll_count: 4,
        roll_details: rolls("Color", 4, "Process Only"),
        scans_sent_at: sentA.toISOString(),
        at_lab_at: new Date(sentA.getTime() - 1 * DAY).toISOString(),
      }),
      makeOrder({
        id: "never-sent",
        status: "Received at Lab",
        film_process: "Black & White",
        roll_count: 3,
        at_lab_at: new Date(NOW.getTime() - 9 * DAY).toISOString(),
      }),
    ], NOW);

    expect(metrics.averageColorTurnaroundDays).toBe(6);
    expect(metrics.averageBwTurnaroundDays).toBeNull();
    expect(metrics.rollsProcessing).toBe(3);
  });

  it("reads scans sent from status history when the column is empty", () => {
    const sent = new Date(NOW.getTime() - 1 * DAY);
    const metrics = computeFilmMetrics([
      makeOrder({
        film_process: "Color",
        roll_count: 3,
        scans_sent_at: undefined,
        at_lab_at: new Date(sent.getTime() - 3 * DAY).toISOString(),
        status_history: [{ status: "Scans Sent", changed_at: sent.toISOString() }],
      }),
    ], NOW);

    expect(metrics.scansSentThisWeek).toBe(3);
    expect(metrics.averageColorTurnaroundDays).toBe(3);
  });

  it("returns only aggregate fields, including the lab run and a null average", () => {
    const metrics = computeFilmMetrics([
      makeOrder({ customer_name: "Ada Lovelace", customer_email: "ada@example.com", wetransfer_link: "https://secret.example" }),
    ], NOW);

    expect(Object.keys(metrics).sort()).toEqual([
      "averageBwTurnaroundDays",
      "averageColorTurnaroundDays",
      "nextLabRun",
      "receivedThisWeek",
      "receivedToday",
      "rollsProcessing",
      "scansSentThisWeek",
      "scansSentToday",
    ]);
    expect(metrics.averageColorTurnaroundDays).toBeNull();
    expect(metrics.averageBwTurnaroundDays).toBeNull();
    expect(metrics.nextLabRun).toBe("Friday 12:00 PM");
    expect(JSON.stringify(metrics)).not.toMatch(/Ada|ada@|secret|wetransfer/i);
    expect(FILM_METRICS_CONFIG.labRuns.weekdays).toEqual([2, 5]);
    expect(FILM_METRICS_CONFIG.weekStartsOn).toBe(0);
    expect(FILM_METRICS_CONFIG.turnaroundWindowDays).toBe(30);
    expect(FILM_METRICS_CONFIG.minimumTurnaroundSamples).toBe(3);
  });
});
