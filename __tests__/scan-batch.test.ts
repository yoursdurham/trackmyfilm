import { describe, expect, it } from "vitest";
import {
  getPartialScanProgress,
  isMixedScanOrder,
  isPartialScanDeliveryComplete,
  scansSentBlockedReason,
} from "../lib/scan-batch";
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
    roll_count: 2,
    dropoff_date: "2026-05-26",
    dropoff_number: 1,
    ...overrides,
  };
}

describe("isMixedScanOrder", () => {
  it("detects mixed rolls in roll_details", () => {
    expect(isMixedScanOrder(makeOrder({
      roll_details: [
        { film_type: "35mm", film_process: "Color", scan_size: "Standard" },
        { film_type: "35mm", film_process: "Black & White", scan_size: "Standard" },
      ],
    }))).toBe(true);
  });

  it("returns false for single-process orders", () => {
    expect(isMixedScanOrder(makeOrder({
      film_process: "Color",
      roll_details: [{ film_type: "35mm", film_process: "Color", scan_size: "Standard" }],
    }))).toBe(false);
  });

  it("treats film_process Both as mixed when roll_details are missing", () => {
    expect(isMixedScanOrder(makeOrder({ film_process: "Both", roll_details: undefined }))).toBe(true);
  });

  it("ignores process-only rolls when detecting mixed scan orders", () => {
    expect(isMixedScanOrder(makeOrder({
      roll_details: [
        { film_type: "35mm", film_process: "Color", scan_size: "Process Only" },
        { film_type: "35mm", film_process: "Black & White", scan_size: "Standard" },
      ],
    }))).toBe(false);
  });
});

describe("partial scan delivery", () => {
  const mixed = makeOrder({
    roll_details: [
      { film_type: "35mm", film_process: "Color", scan_size: "Standard" },
      { film_type: "35mm", film_process: "Black & White", scan_size: "Standard" },
    ],
  });

  it("blocks Scans Sent until both batches are recorded", () => {
    expect(scansSentBlockedReason(mixed, false)).toMatch(/partial scans/i);
    expect(isPartialScanDeliveryComplete(mixed)).toBe(false);
  });

  it("allows Scans Sent when both batch links and timestamps exist", () => {
    const complete = makeOrder({
      ...mixed,
      color_scans_wetransfer_link: "https://wetransfer.com/c",
      color_scans_delivered_at: "2026-09-29T12:00:00.000Z",
      bw_scans_wetransfer_link: "https://wetransfer.com/bw",
      bw_scans_delivered_at: "2026-09-30T12:00:00.000Z",
    });
    expect(isPartialScanDeliveryComplete(complete)).toBe(true);
    expect(scansSentBlockedReason(complete, false)).toBeNull();
  });

  it("reports partial progress without exposing links in helper output", () => {
    const partial = makeOrder({
      ...mixed,
      color_scans_wetransfer_link: "https://wetransfer.com/c",
      color_scans_delivered_at: "2026-09-29T12:00:00.000Z",
    });
    const progress = getPartialScanProgress(partial);
    expect(progress[0].delivered).toBe(true);
    expect(progress[1].delivered).toBe(false);
    expect(progress[0].wetransferLink).toContain("wetransfer");
  });
});
