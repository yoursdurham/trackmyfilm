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
  customer_name: "Jane Doe",
  customer_email: "jane@example.com",
  status: "Received at Lab",
  status_history: [{ status: "Received by Yours", changed_at: "2026-01-01T12:00:00.000Z" }],
  status_updated_at: "2026-01-02T12:00:00.000Z",
  film_type: "35mm",
  film_process: "Both",
  film_stock: "Portra 400",
  roll_count: 2,
  roll_details: [
    {
      film_type: "35mm",
      film_process: "Color",
      film_stock: "Portra 400",
      scan_size: "High-Res",
      prints_4x6: true,
    },
    {
      film_type: "35mm",
      film_process: "Black & White",
      scan_size: "Standard",
    },
  ],
  prints_4x6: true,
  dropoff_date: "2026-01-01",
  dropoff_number: 1,
  notes: "  Please push  ",
  customer_notes: "from the form",
  scan_notes: "lab only",
  wetransfer_link: "https://wetransfer.com/main",
  color_scans_wetransfer_link: "https://wetransfer.com/color",
  bw_scans_wetransfer_link: "https://wetransfer.com/bw",
  color_scans_delivered_at: "2026-09-29T12:00:00.000Z",
  bw_scans_delivered_at: "2026-09-30T12:00:00.000Z",
  email_status: "failed",
  email_error: "smtp",
  last_emailed_at: "2026-09-30T12:00:00.000Z",
};

describe("serializeOrderForPublicTracking", () => {
  it("returns only the fields the tracking page renders", () => {
    const publicOrder = serializeOrderForPublicTracking(order);
    expect(publicOrder).toEqual({
      id: "1",
      order_number: "JE1",
      first_name: "Jane",
      status: "Received at Lab",
      status_history: [{ status: "Received by Yours", changed_at: "2026-01-01T12:00:00.000Z" }],
      dropoff_date: "2026-01-01",
      roll_count: 2,
      film_type: "35mm",
      film_process: "Both",
      film_stock: "Portra 400",
      prints_4x6: true,
      roll_details: [
        {
          film_type: "35mm",
          film_process: "Color",
          film_stock: "Portra 400",
          scan_size: "High-Res",
          prints_4x6: true,
        },
        {
          film_type: "35mm",
          film_process: "Black & White",
          scan_size: "Standard",
        },
      ],
      notes: "Please push",
      process_only: false,
      scan_progress: [
        { batch: "Color", delivered: true, deliveredAt: "2026-09-29T12:00:00.000Z" },
        { batch: "Black & White", delivered: true, deliveredAt: "2026-09-30T12:00:00.000Z" },
      ],
    });
    expect(JSON.stringify(publicOrder)).not.toContain("wetransfer.com");
    expect(JSON.stringify(publicOrder)).not.toContain("jane@example.com");
    expect(JSON.stringify(publicOrder)).not.toContain("c1");
    expect(publicOrder).not.toHaveProperty("customer_email");
    expect(publicOrder).not.toHaveProperty("customer_id");
    expect(publicOrder).not.toHaveProperty("customer_name");
    expect(publicOrder).not.toHaveProperty("customer_notes");
    expect(publicOrder).not.toHaveProperty("scan_notes");
    expect(publicOrder).not.toHaveProperty("email_status");
    expect(publicOrder).not.toHaveProperty("wetransfer_link");
  });

  it("keeps a customer-facing note and drops blank ones", () => {
    expect(serializeOrderForPublicTracking({ ...order, notes: "  hello  " }).notes).toBe("hello");
    expect(serializeOrderForPublicTracking({ ...order, notes: "   " }).notes).toBeUndefined();
  });
});

describe("orderNoteForCustomerDisplay", () => {
  it("returns trimmed text or null", () => {
    expect(orderNoteForCustomerDisplay("  hello  ")).toBe("hello");
    expect(orderNoteForCustomerDisplay("")).toBeNull();
    expect(orderNoteForCustomerDisplay("   ")).toBeNull();
  });
});
