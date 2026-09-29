import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreateOrder = vi.fn();
const mockGetOrderByNumber = vi.fn();
const mockGetCustomerByEmailOrName = vi.fn();
const mockCreateCustomer = vi.fn();
const mockUpdateCustomer = vi.fn();
const mockSendOrderEmail = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuth: vi.fn(async () => ({ id: "user-1", email: "staff@example.com" })),
}));

vi.mock("@/lib/db", () => ({
  getCustomerByEmailOrName: (...args: unknown[]) => mockGetCustomerByEmailOrName(...args),
  createCustomer: (...args: unknown[]) => mockCreateCustomer(...args),
  updateCustomer: (...args: unknown[]) => mockUpdateCustomer(...args),
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
  getOrderByNumber: (...args: unknown[]) => mockGetOrderByNumber(...args),
}));

vi.mock("@/lib/email-service", () => ({
  sendOrderEmail: (...args: unknown[]) => mockSendOrderEmail(...args),
}));

import { POST } from "@/app/api/dropoff/route";

const basePayload = {
  customer_name: "Jane Doe",
  customer_email: "jane@example.com",
  order_number: "JE9999",
  dropoff_date: "2026-09-29",
  roll_count: 2,
  film_type: "110",
  film_process: "Color",
  roll_details: [
    { film_type: "110", film_process: "Color", scan_size: "Standard" },
    { film_type: "110", film_process: "Color", scan_size: "Standard" },
  ],
  send_email: false,
};

describe("POST /api/dropoff — 110 film", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrderByNumber.mockResolvedValue(null);
    mockGetCustomerByEmailOrName.mockResolvedValue({
      id: "cust-1",
      first_name: "Jane",
      total_rolls: 0,
      total_dropoffs: 0,
    });
    mockCreateCustomer.mockResolvedValue({
      id: "cust-new",
      first_name: "Jane",
      total_rolls: 0,
      total_dropoffs: 0,
    });
    mockCreateOrder.mockImplementation(async (data: Record<string, unknown>) => ({
      id: "order-1",
      ...data,
    }));
    mockUpdateCustomer.mockResolvedValue({});
  });

  it("accepts a 2-roll order with string film_type 110 on order and roll_details", async () => {
    const req = new Request("http://localhost/api/dropoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(basePayload),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.success).toBe(true);

    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
    const orderArg = mockCreateOrder.mock.calls[0][0];
    expect(orderArg.film_type).toBe("110");
    expect(typeof orderArg.film_type).toBe("string");
    expect(orderArg.roll_details).toHaveLength(2);
    expect(orderArg.roll_details[0].film_type).toBe("110");
    expect(orderArg.roll_details[1].film_type).toBe("110");
  });

  it("coerces numeric 110 to string film_type", async () => {
    const req = new Request("http://localhost/api/dropoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...basePayload,
        film_type: 110,
        roll_details: [
          { film_type: 110, film_process: "Color", scan_size: "Standard" },
          { film_type: "110", film_process: "Color", scan_size: "Standard" },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const orderArg = mockCreateOrder.mock.calls[0][0];
    expect(orderArg.film_type).toBe("110");
    expect(orderArg.roll_details[0].film_type).toBe("110");
  });

  it("creates a new customer with core fields only (no migration-010 columns)", async () => {
    mockGetCustomerByEmailOrName.mockResolvedValue(null);

    const req = new Request("http://localhost/api/dropoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...basePayload,
        customer_email: "new.person@example.com",
        order_number: "JE-NEW-001",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(mockCreateCustomer).toHaveBeenCalledTimes(1);
    const createArg = mockCreateCustomer.mock.calls[0][0];
    expect(createArg).toMatchObject({
      first_name: "Jane",
      email: "new.person@example.com",
      normalized_name: "jane doe",
      total_rolls: 0,
      total_dropoffs: 0,
    });
    expect(createArg).not.toHaveProperty("user_id");
    expect(createArg).not.toHaveProperty("default_film_type");
    expect(createArg).not.toHaveProperty("default_film_process");
    expect(createArg).not.toHaveProperty("default_scan_size");

    const body = await res.json();
    expect(body.customer.isNew).toBe(true);
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
  });

  it("creates new customer with 2 rolls of 110 film", async () => {
    mockGetCustomerByEmailOrName.mockResolvedValue(null);

    const req = new Request("http://localhost/api/dropoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...basePayload,
        customer_email: "new110@example.com",
        order_number: "JE-NEW-110",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockCreateCustomer).toHaveBeenCalledTimes(1);
    const orderArg = mockCreateOrder.mock.calls[0][0];
    expect(orderArg.film_type).toBe("110");
    expect(orderArg.roll_count).toBe(2);
  });

  it("rejects invalid film_type in roll_details", async () => {
    const req = new Request("http://localhost/api/dropoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...basePayload,
        roll_details: [
          { film_type: "70mm", film_process: "Color", scan_size: "Standard" },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/roll_details\[0\]\.film_type/);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });
});
