import { describe, expect, it } from "vitest";
import { serializeOrderForPublicTracking } from "../lib/tracking-public";
import type { FilmOrder } from "../lib/types";

const order: FilmOrder = {
  id: "1",
  order_number: "JE1",
  customer_id: "c1",
  customer_name: "Jane",
  customer_email: "jane@example.com",
  status: "Received at Lab",
  status_history: [],
  status_updated_at: "",
  film_type: "35mm",
  film_process: "Both",
  roll_count: 2,
  dropoff_date: "2026-01-01",
  dropoff_number: 1,
  wetransfer_link: "https://wetransfer.com/main",
  color_scans_wetransfer_link: "https://wetransfer.com/color",
  bw_scans_wetransfer_link: "https://wetransfer.com/bw",
  color_scans_delivered_at: "2026-09-29T12:00:00.000Z",
};

describe("serializeOrderForPublicTracking", () => {
  it("strips all download links without a valid token", () => {
    const publicOrder = serializeOrderForPublicTracking(order, false);
    expect(publicOrder.wetransfer_link).toBeUndefined();
    expect(publicOrder.color_scans_wetransfer_link).toBeUndefined();
    expect(publicOrder.bw_scans_wetransfer_link).toBeUndefined();
    expect(publicOrder.color_scans_delivered_at).toBeDefined();
  });

  it("keeps links when token is valid", () => {
    const full = serializeOrderForPublicTracking(order, true);
    expect(full.color_scans_wetransfer_link).toBe(order.color_scans_wetransfer_link);
  });
});
