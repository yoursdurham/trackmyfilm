import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreateTrackMyFilmOrder = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuth: vi.fn(async () => ({ id: "user-1", email: "staff@example.com" })),
}));

vi.mock("@/lib/order-create-service", () => ({
  createTrackMyFilmOrder: (...args: unknown[]) => mockCreateTrackMyFilmOrder(...args),
  squarespaceImportToCreateInput: (input: Record<string, unknown>) => ({
    ...input,
    order_number: input.order_number ?? `SQ-${input.external_order_id}`,
    dropoff_date: input.order_date ?? "2026-10-01",
    import: { import_source: "squarespace", external_order_id: input.external_order_id },
  }),
}));

import { POST as dropoffPost } from "@/app/api/dropoff/route";
import { POST as importPost } from "@/app/api/orders/import/squarespace/route";

describe("order creation routes delegate to shared service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTrackMyFilmOrder.mockResolvedValue({
      success: true,
      order: { id: "o1", order_number: "JE1" },
      customer: { id: "c1", first_name: "Jane", last_name: "", total_dropoffs: 1 },
      createdCustomer: false,
      customer_total_dropoffs: 1,
      email: { sent: false, skipped: true },
    });
  });

  it("POST /api/dropoff uses manual_received intake mode", async () => {
    const req = new Request("http://localhost/api/dropoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: "Jane",
        customer_email: "jane@example.com",
        order_number: "JE1",
        dropoff_date: "2026-10-01",
        roll_count: 1,
        film_type: "35mm",
        film_process: "Color",
        send_email: false,
      }),
    });

    const res = await dropoffPost(req);
    expect(res.status).toBe(201);
    expect(mockCreateTrackMyFilmOrder).toHaveBeenCalledWith(
      expect.objectContaining({ order_number: "JE1" }),
      expect.objectContaining({ intake_mode: "manual_received", send_email: false })
    );
  });

  it("POST /api/orders/import/squarespace uses pending_import intake mode", async () => {
    const req = new Request("http://localhost/api/orders/import/squarespace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        external_order_id: "SS-9",
        customer_name: "Jane",
        customer_email: "jane@example.com",
        roll_count: 1,
        film_type: "35mm",
        film_process: "Color",
      }),
    });

    const res = await importPost(req);
    expect(res.status).toBe(201);
    expect(mockCreateTrackMyFilmOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        import: expect.objectContaining({ external_order_id: "SS-9" }),
      }),
      expect.objectContaining({ intake_mode: "pending_import", send_email: false })
    );
  });
});
