import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilmOrder } from "@/lib/types";

const mockGetOrderByNumberAndEmail = vi.fn();
const mockGetCustomerByEmail = vi.fn();
const mockGetOrdersByCustomerId = vi.fn();

vi.mock("@/lib/db", () => ({
  getOrderByNumberAndEmail: (...args: unknown[]) => mockGetOrderByNumberAndEmail(...args),
  getCustomerByEmail: (...args: unknown[]) => mockGetCustomerByEmail(...args),
  getOrdersByCustomerId: (...args: unknown[]) => mockGetOrdersByCustomerId(...args),
}));

import { GET as trackOrder } from "@/app/api/orders/track/route";

const fullOrder: FilmOrder = {
  id: "order-1",
  order_number: "1034",
  customer_id: "customer-1",
  customer_name: "Ada Lovelace",
  customer_email: "ada@example.com",
  status: "Scans Sent",
  status_history: [
    { status: "Received by Yours", changed_at: "2026-04-01T15:00:00.000Z", note: "internal" } as FilmOrder["status_history"][number],
  ],
  status_updated_at: "2026-04-02T15:00:00.000Z",
  film_type: "35mm",
  film_process: "Color",
  film_stock: "Gold 200",
  roll_count: 1,
  roll_details: [{
    film_type: "35mm",
    film_process: "Color",
    film_stock: "Gold 200",
    scan_size: "Standard",
    prints_4x6: false,
  }],
  dropoff_date: "2026-04-01",
  dropoff_number: 4,
  notes: "Leave with the front desk",
  customer_notes: "staff should not see this on tracking",
  scan_notes: "lab only",
  wetransfer_link: "https://wetransfer.com/secret",
  email_status: "sent",
  email_error: null,
  last_emailed_at: "2026-04-02T15:00:00.000Z",
};

const customer = {
  id: "customer-1",
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.com",
  phone: "919-555-0100",
  notes: "prefers text",
  total_rolls: 12,
  total_dropoffs: 4,
};

describe("GET /api/orders/track", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrderByNumberAndEmail.mockResolvedValue(fullOrder);
    mockGetCustomerByEmail.mockResolvedValue(customer);
    mockGetOrdersByCustomerId.mockResolvedValue([fullOrder]);
  });

  it("requires an email before an order-number lookup", async () => {
    const res = await trackOrder(new Request("http://localhost/api/orders/track?order_number=1034"));
    expect(res.status).toBe(400);
    expect(mockGetOrderByNumberAndEmail).not.toHaveBeenCalled();
  });

  it("returns the same empty list for a wrong email and a missing order", async () => {
    mockGetOrderByNumberAndEmail.mockImplementation(async (orderNumber: string, email: string) => (
      orderNumber === "1034" && email === "ada@example.com" ? fullOrder : null
    ));

    const wrong = await trackOrder(new Request(
      "http://localhost/api/orders/track?order_number=1034&email=other@example.com"
    ));
    const missing = await trackOrder(new Request(
      "http://localhost/api/orders/track?order_number=9999&email=ada@example.com"
    ));

    expect(wrong.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(await wrong.json()).toEqual([]);
    expect(await missing.json()).toEqual([]);
  });

  it("returns only allowlisted fields and ignores wildcard emails", async () => {
    const match = await trackOrder(new Request(
      "http://localhost/api/orders/track?order_number=01034&email=Ada@Example.com"
    ));
    const body = await match.json();
    expect(match.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].first_name).toBe("Ada");
    expect(body[0].order_number).toBe("1034");
    expect(body[0].notes).toBe("Leave with the front desk");
    expect(body[0].status_history).toEqual([
      { status: "Received by Yours", changed_at: "2026-04-01T15:00:00.000Z" },
    ]);
    expect(body[0].roll_details[0]).toEqual({
      film_type: "35mm",
      film_process: "Color",
      film_stock: "Gold 200",
      scan_size: "Standard",
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("ada@example.com");
    expect(serialized).not.toContain("customer-1");
    expect(serialized).not.toContain("Lovelace");
    expect(serialized).not.toContain("wetransfer");
    expect(serialized).not.toContain("919-555");
    expect(serialized).not.toContain("staff should not");
    expect(serialized).not.toContain("lab only");
    expect(body[0]).not.toHaveProperty("customer");
    expect(body[0]).not.toHaveProperty("customer_email");
    expect(body[0]).not.toHaveProperty("customer_id");
    expect(body[0]).not.toHaveProperty("customer_name");
    expect(body[0]).not.toHaveProperty("phone");

    const wildcard = await trackOrder(new Request(
      "http://localhost/api/orders/track?order_number=1034&email=%25"
    ));
    const underscore = await trackOrder(new Request(
      "http://localhost/api/orders/track?order_number=1034&email=a_a%40example.com"
    ));
    expect(await wildcard.json()).toEqual([]);
    expect(await underscore.json()).toEqual([]);
    expect(mockGetOrderByNumberAndEmail).toHaveBeenCalledWith("01034", "ada@example.com");
    expect(mockGetOrderByNumberAndEmail).toHaveBeenCalledWith("1034", "%");
    expect(mockGetOrderByNumberAndEmail).toHaveBeenCalledWith("1034", "a_a@example.com");
  });

  it("lists a customer's orders by exact email without the customer record", async () => {
    const res = await trackOrder(new Request(
      "http://localhost/api/orders/track?email=ADA@example.com"
    ));
    const body = await res.json();
    expect(body.first_name).toBe("Ada");
    expect(body.customer).toBeUndefined();
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0].first_name).toBe("Ada");
    expect(JSON.stringify(body)).not.toContain("919-555");
    expect(JSON.stringify(body)).not.toContain("prefers text");
    expect(JSON.stringify(body)).not.toContain("Lovelace");
    expect(JSON.stringify(body)).not.toContain("ada@example.com");

    const wildcard = await trackOrder(new Request("http://localhost/api/orders/track?email=%25"));
    expect(await wildcard.json()).toEqual({ first_name: null, orders: [] });
    expect(mockGetOrdersByCustomerId).toHaveBeenCalledTimes(1);
  });
});
