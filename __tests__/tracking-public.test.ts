import { describe, expect, it } from "vitest";
import {
  orderNoteForCustomerDisplay,
  serializeOrderForPublicTracking,
} from "../lib/tracking-public";
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

  it("keeps staff order notes for public tracking", () => {
    const withNotes = { ...order, notes: "Handle with care" };
    const publicOrder = serializeOrderForPublicTracking(withNotes, false);
    expect(publicOrder.notes).toBe("Handle with care");
  });

  it("strips internal-only note and email fields", () => {
    const enriched = {
      ...order,
      scan_notes: "lab only",
      customer_notes: "from customer form",
      email_status: "failed",
      email_error: "smtp",
    };
    const publicOrder = serializeOrderForPublicTracking(enriched, false);
    expect(publicOrder.scan_notes).toBeUndefined();
    expect(publicOrder.customer_notes).toBeUndefined();
    expect(publicOrder.email_status).toBeUndefined();
    expect(publicOrder.email_error).toBeUndefined();
  });
});

describe("orderNoteForCustomerDisplay", () => {
  it("returns trimmed text or null", () => {
    expect(orderNoteForCustomerDisplay("  hello  ")).toBe("hello");
    expect(orderNoteForCustomerDisplay("")).toBeNull();
    expect(orderNoteForCustomerDisplay("   ")).toBeNull();
  });
});
