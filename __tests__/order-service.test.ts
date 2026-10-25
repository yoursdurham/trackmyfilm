import { describe, expect, it } from "vitest";
import { emailTemplateForStatus, getStatusOptionsForOrder, isProcessOnlyOrder, isScansOnlyOrder } from "../lib/order-service";
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

describe("isProcessOnlyOrder", () => {
  it("detects orders where every roll is Process Only", () => {
    expect(isProcessOnlyOrder(makeOrder({
      roll_details: [
        { film_type: "35mm", film_process: "Color", scan_size: "Process Only" },
        { film_type: "120", film_process: "Black & White", scan_size: "Process Only" },
      ],
    }))).toBe(true);
  });

  it("does not treat mixed scan orders as Process Only", () => {
    expect(isProcessOnlyOrder(makeOrder({
      roll_details: [
        { film_type: "35mm", film_process: "Color", scan_size: "Process Only" },
        { film_type: "35mm", film_process: "Color", scan_size: "Standard" },
      ],
    }))).toBe(false);
  });

  it("falls back to legacy scan option fields when roll details have no scan sizes", () => {
    const order = makeOrder({
      roll_details: [{ film_type: "35mm", film_process: "Color" }],
    }) as FilmOrder & { scan_option: string };

    order.scan_option = "Process Only";

    expect(isProcessOnlyOrder(order)).toBe(true);
  });
});

describe("isScansOnlyOrder", () => {
  it("detects orders where every roll is Scans Only", () => {
    const order = makeOrder({
      roll_details: [
        { film_type: "35mm", film_process: "Color", scan_size: "Scans Only" },
        { film_type: "120", film_process: "Black & White", scan_size: "scan only" },
      ] as FilmOrder["roll_details"],
    });
    expect(isScansOnlyOrder(order)).toBe(true);
    expect(isProcessOnlyOrder(order)).toBe(false);
    expect(getStatusOptionsForOrder(order)).toEqual([
      "Received by Yours",
      "Scans Sent",
      "On Hold",
    ]);
    expect(emailTemplateForStatus(order, "Scans Sent")).toBe("scans_only_ready");
    expect(emailTemplateForStatus(order, "Received by Yours")).toBe("film_drop_received");
  });

  it("does not treat a mixed order as Scans Only", () => {
    const order = makeOrder({
      roll_details: [
        { film_type: "35mm", film_process: "Color", scan_size: "Scans Only" },
        { film_type: "35mm", film_process: "Color", scan_size: "High-Res" },
      ],
    });
    expect(isScansOnlyOrder(order)).toBe(false);
    expect(emailTemplateForStatus(order, "Scans Sent")).toBe("scans_sent");
  });

  it("falls back to a legacy scans-only field when rolls have no scan size", () => {
    const order = makeOrder({
      roll_details: [{ film_type: "35mm", film_process: "Color" }],
    }) as FilmOrder & { scan_size: string };
    order.scan_size = "scans_only";
    expect(isScansOnlyOrder(order)).toBe(true);
  });
});
