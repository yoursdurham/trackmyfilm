import { describe, expect, it } from "vitest";
import { isProcessOnlyOrder } from "../lib/order-service";
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
