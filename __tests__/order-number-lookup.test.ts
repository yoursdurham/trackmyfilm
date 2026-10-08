import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { orderNumbersMatch } from "../lib/validation";

const mockRequireAuth = vi.fn();
const mockGetOrderByNumber = vi.fn();
const mockGetOrderByNumberAndEmail = vi.fn();
const mockGetCustomerByEmail = vi.fn();
const mockGetOrdersByCustomerId = vi.fn();
const mockCreateOrder = vi.fn();
const mockGetOrders = vi.fn();
const mockUpdateOrder = vi.fn();
const mockGetOrderById = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock("@/lib/db", () => ({
  getOrderByNumber: (...args: unknown[]) => mockGetOrderByNumber(...args),
  getOrderByNumberAndEmail: (...args: unknown[]) => mockGetOrderByNumberAndEmail(...args),
  getCustomerByEmail: (...args: unknown[]) => mockGetCustomerByEmail(...args),
  getOrdersByCustomerId: (...args: unknown[]) => mockGetOrdersByCustomerId(...args),
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
  getOrders: (...args: unknown[]) => mockGetOrders(...args),
  updateOrder: (...args: unknown[]) => mockUpdateOrder(...args),
  getOrderById: (...args: unknown[]) => mockGetOrderById(...args),
  deleteOrder: vi.fn(),
  deleteIncomingDraftsForOrder: vi.fn(),
  getCustomerById: vi.fn(),
  updateCustomer: vi.fn(),
}));

import { GET as trackOrder } from "@/app/api/orders/track/route";
import { POST as resendLink } from "@/app/api/resend-link/route";
import { POST as createOrderRoute } from "@/app/api/orders/route";
import { PATCH as updateOrderRoute } from "@/app/api/orders/[id]/route";

const STORED = {
  id: "order-1034",
  order_number: "1034",
  customer_name: "Ada",
  customer_email: "ada@example.com",
  status: "Scans Sent",
  wetransfer_link: "https://wetransfer.com/abc",
  roll_count: 1,
  last_emailed_at: null,
};

function matchesStored(orderNumber: string) {
  return orderNumbersMatch(orderNumber, "1034") || orderNumbersMatch(orderNumber, "01037");
}

describe("order number lookups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: "user-1" });
    mockGetOrderByNumber.mockImplementation(async (orderNumber: string) => {
      if (orderNumbersMatch(orderNumber, "1034")) return { ...STORED, order_number: "1034" };
      if (orderNumbersMatch(orderNumber, "01037")) return { ...STORED, id: "order-01037", order_number: "01037" };
      return null;
    });
    mockGetOrderByNumberAndEmail.mockImplementation(async (orderNumber: string) => (
      matchesStored(orderNumber) ? STORED : null
    ));
    mockCreateOrder.mockImplementation(async (data: Record<string, unknown>) => ({ id: "new", ...data }));
    mockUpdateOrder.mockImplementation(async (id: string, data: Record<string, unknown>) => ({ id, ...data }));
    mockGetOrderById.mockResolvedValue({ id: "order-1034", order_number: "1034" });
  });

  it("tracks 01034 and 1034 to the same stored order", async () => {
    const padded = await trackOrder(new Request("http://localhost/api/orders/track?order_number=01034"));
    const plain = await trackOrder(new Request("http://localhost/api/orders/track?order_number=1034"));
    const other = await trackOrder(new Request("http://localhost/api/orders/track?order_number=1035"));

    expect(padded.status).toBe(200);
    expect(plain.status).toBe(200);
    expect(await padded.json()).toMatchObject([{ order_number: "1034" }]);
    expect(await plain.json()).toMatchObject([{ order_number: "1034" }]);
    expect(await other.json()).toEqual([]);
    expect(mockGetOrderByNumber).toHaveBeenCalledWith("01034");
    expect(mockGetOrderByNumber).toHaveBeenCalledWith("1034");
  });

  it("resends a link for either leading-zero form", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.RESEND_API_KEY;

    const padded = await resendLink(new Request("http://localhost/api/resend-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber: "01034", email: "ada@example.com" }),
    }));
    const plain = await resendLink(new Request("http://localhost/api/resend-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber: "1034", email: "ada@example.com" }),
    }));

    expect(padded.status).toBe(200);
    expect(plain.status).toBe(200);
    expect(mockGetOrderByNumberAndEmail).toHaveBeenCalledWith("01034", "ada@example.com");
    expect(mockGetOrderByNumberAndEmail).toHaveBeenCalledWith("1034", "ada@example.com");
    expect(errorSpy).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it("rejects a new order when the other leading-zero form already exists", async () => {
    const padded = await createOrderRoute(new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_number: "01034", customer_name: "Ada" }),
    }));
    const plain = await createOrderRoute(new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_number: "1037", customer_name: "Ada" }),
    }));

    expect(padded.status).toBe(409);
    expect(plain.status).toBe(409);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it("keeps the leading zero when creating an order number that is not taken", async () => {
    mockGetOrderByNumber.mockResolvedValue(null);
    const res = await createOrderRoute(new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_number: "01099", customer_name: "Ada" }),
    }));
    expect(res.status).toBe(201);
    expect(mockCreateOrder.mock.calls[0][0].order_number).toBe("01099");
  });

  it("rejects an edit that collides with the other leading-zero form", async () => {
    mockGetOrderById.mockResolvedValue({ id: "order-5000", order_number: "5000" });
    const res = await updateOrderRoute(new Request("http://localhost/api/orders/order-5000", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_number: "01034" }),
    }), { params: Promise.resolve({ id: "order-5000" }) });

    expect(res.status).toBe(409);
    expect(mockUpdateOrder).not.toHaveBeenCalled();
  });

  it("saves a new number with its leading zero when nothing else uses that key", async () => {
    mockGetOrderById.mockResolvedValue({ id: "order-5000", order_number: "5000" });
    mockGetOrderByNumber.mockResolvedValue(null);
    const res = await updateOrderRoute(new Request("http://localhost/api/orders/order-5000", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_number: " 01099 " }),
    }), { params: Promise.resolve({ id: "order-5000" }) });

    expect(res.status).toBe(200);
    expect(mockUpdateOrder).toHaveBeenCalledWith("order-5000", expect.objectContaining({
      order_number: "01099",
    }));
  });

  it("requires a staff session before an order-number edit", async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    const res = await updateOrderRoute(new Request("http://localhost/api/orders/order-5000", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_number: "01034" }),
    }), { params: Promise.resolve({ id: "order-5000" }) });
    expect(res.status).toBe(401);
    expect(mockUpdateOrder).not.toHaveBeenCalled();
  });
});
