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
import { POST as resendLink, RESEND_LINK_MESSAGE, resetResendLinkStateForTests } from "@/app/api/resend-link/route";
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
    resetResendLinkStateForTests();
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

  it("tracks 01034 and 1034 to the same stored order when the email matches", async () => {
    const padded = await trackOrder(new Request("http://localhost/api/orders/track?order_number=01034&email=ada@example.com"));
    const plain = await trackOrder(new Request("http://localhost/api/orders/track?order_number=1034&email=ADA@example.com"));
    const other = await trackOrder(new Request("http://localhost/api/orders/track?order_number=1035&email=ada@example.com"));

    expect(padded.status).toBe(200);
    expect(plain.status).toBe(200);
    expect(await padded.json()).toMatchObject([{ order_number: "1034", first_name: "Ada" }]);
    expect(await plain.json()).toMatchObject([{ order_number: "1034" }]);
    expect(await other.json()).toEqual([]);
    expect(mockGetOrderByNumberAndEmail).toHaveBeenCalledWith("01034", "ada@example.com");
    expect(mockGetOrderByNumberAndEmail).toHaveBeenCalledWith("1034", "ada@example.com");
    expect(mockGetOrderByNumber).not.toHaveBeenCalled();
  });

  it("tracks an order number alone, including a leading zero", async () => {
    const padded = await trackOrder(new Request("http://localhost/api/orders/track?order_number=01034"));
    const plain = await trackOrder(new Request("http://localhost/api/orders/track?order_number=1034"));
    const missing = await trackOrder(new Request("http://localhost/api/orders/track?order_number=9999"));

    expect(padded.status).toBe(200);
    expect(plain.status).toBe(200);
    expect(await padded.json()).toMatchObject([{ order_number: "1034", first_name: "Ada" }]);
    expect(await plain.json()).toMatchObject([{ order_number: "1034" }]);
    expect(await missing.json()).toEqual([]);
    expect(mockGetOrderByNumber).toHaveBeenCalledWith("01034");
    expect(mockGetOrderByNumber).toHaveBeenCalledWith("1034");
    expect(mockGetOrderByNumberAndEmail).not.toHaveBeenCalled();
  });

  it("resends a link for either leading-zero form", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.RESEND_API_KEY;

    const padded = await resendLink(new Request("http://localhost/api/resend-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber: "01034" }),
    }));
    const plain = await resendLink(new Request("http://localhost/api/resend-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber: "1034" }),
    }));

    expect(padded.status).toBe(200);
    expect(plain.status).toBe(200);
    expect(mockGetOrderByNumber).toHaveBeenCalledWith("01034");
    expect(mockGetOrderByNumber).toHaveBeenCalledWith("1034");
    expect(mockGetOrderByNumberAndEmail).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it("emails the address stored on the order and ignores an address in the request", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_TEMPLATE_SCANS_SENT = "tmpl";
    mockGetOrderByNumber.mockResolvedValue({
      ...STORED,
      customer_email: "Ada@Example.com",
      last_emailed_at: null,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email-1" }), { status: 200 })
    );

    const typed = await resendLink(new Request("http://localhost/api/resend-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber: "1034", email: "someone@example.com" }),
    }));

    expect(await typed.json()).toEqual({ success: true, message: RESEND_LINK_MESSAGE });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(payload.to).toEqual(["ada@example.com"]);
    expect(payload.template.id).toBe("tmpl");
    expect(JSON.stringify(payload)).not.toContain("someone@example.com");

    resetResendLinkStateForTests();
    mockGetOrderByNumber.mockResolvedValue({ ...STORED, last_emailed_at: null });
    const alone = await resendLink(new Request("http://localhost/api/resend-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber: "01034" }),
    }));

    expect(await alone.json()).toEqual({ success: true, message: RESEND_LINK_MESSAGE });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const second = JSON.parse(String((fetchSpy.mock.calls[1][1] as RequestInit).body));
    expect(second.to).toEqual(["ada@example.com"]);
    expect(mockGetOrderByNumber).toHaveBeenCalledWith("01034");
    expect(mockGetOrderByNumberAndEmail).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("waits an hour between download-link emails and uses the same message when the order is missing", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_TEMPLATE_SCANS_SENT = "tmpl";
    mockGetOrderByNumber.mockResolvedValue({
      ...STORED,
      last_emailed_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email-1" }), { status: 200 })
    );

    const cooled = await resendLink(new Request("http://localhost/api/resend-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber: "1034", email: "ada@example.com" }),
    }));

    mockGetOrderByNumber.mockResolvedValue(null);
    const missing = await resendLink(new Request("http://localhost/api/resend-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber: "9999", email: "nope@example.com" }),
    }));

    expect(await cooled.json()).toEqual({ success: true, message: RESEND_LINK_MESSAGE });
    expect(await missing.json()).toEqual({ success: true, message: RESEND_LINK_MESSAGE });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("sends again once last_emailed_at is older than an hour", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_TEMPLATE_SCANS_SENT = "tmpl";
    mockGetOrderByNumber.mockResolvedValue({
      ...STORED,
      customer_email: "Ada@Example.com",
      last_emailed_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email-1" }), { status: 200 })
    );

    const res = await resendLink(new Request("http://localhost/api/resend-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber: "1034", email: "ada@example.com" }),
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: RESEND_LINK_MESSAGE });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(payload.to).toEqual(["ada@example.com"]);
    expect(payload.template.id).toBe("tmpl");
    expect(mockUpdateOrder).toHaveBeenCalledWith("order-1034", expect.objectContaining({
      last_emailed_at: expect.any(String),
      email_status: "sent",
    }));
    fetchSpy.mockRestore();
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
