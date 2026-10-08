import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequireAuth = vi.fn();
const mockGetOrderByNumber = vi.fn();
const mockUpdateOrder = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock("@/lib/db", () => ({
  getOrderByNumber: (...args: unknown[]) => mockGetOrderByNumber(...args),
  updateOrder: (...args: unknown[]) => mockUpdateOrder(...args),
}));

import { POST } from "@/app/api/orders/note/route";
import { orderNumbersMatch } from "../lib/validation";

const ORDER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("POST /api/orders/note", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: "user-1", email: "staff@example.com" });
    mockGetOrderByNumber.mockResolvedValue({ id: ORDER_ID, order_number: "JE1", notes: "staff note" });
    mockUpdateOrder.mockResolvedValue({ id: ORDER_ID });
  });

  function post(body: unknown) {
    return POST(new Request("http://localhost/api/orders/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
  }

  it("returns 401 and does not write when there is no staff session", async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const res = await post({ order_number: "JE1", note: "hello", notes: "overwrite staff" });

    expect(res.status).toBe(401);
    expect(mockGetOrderByNumber).not.toHaveBeenCalled();
    expect(mockUpdateOrder).not.toHaveBeenCalled();
  });

  it("writes only customer_notes for a staff session", async () => {
    const res = await post({
      order_number: " je1 ",
      note: "  from the counter  ",
      notes: "do not replace staff notes",
      status: "Scans Sent",
      customer_email: "attacker@example.com",
    });

    expect(res.status).toBe(200);
    expect(mockGetOrderByNumber).toHaveBeenCalledWith("JE1");
    expect(mockUpdateOrder).toHaveBeenCalledTimes(1);
    expect(mockUpdateOrder).toHaveBeenCalledWith(ORDER_ID, { customer_notes: "from the counter" });
  });

  it("rejects an empty note without writing", async () => {
    const res = await post({ order_number: "JE1", note: "   " });
    expect(res.status).toBe(400);
    expect(mockUpdateOrder).not.toHaveBeenCalled();
  });

  it("rejects a note longer than 1000 characters without writing", async () => {
    const res = await post({ order_number: "JE1", note: "a".repeat(1001) });
    expect(res.status).toBe(400);
    expect(mockUpdateOrder).not.toHaveBeenCalled();
  });

  it("finds 01034 and 1034 as the same order", async () => {
    mockGetOrderByNumber.mockImplementation(async (orderNumber: string) => (
      orderNumbersMatch(String(orderNumber), "1034")
        ? { id: ORDER_ID, order_number: "01034" }
        : null
    ));

    const padded = await post({ order_number: "01034", note: "hello" });
    const plain = await post({ order_number: "1034", note: "hello" });
    const other = await post({ order_number: "1035", note: "hello" });

    expect(padded.status).toBe(200);
    expect(plain.status).toBe(200);
    expect(other.status).toBe(404);
    expect(mockGetOrderByNumber).toHaveBeenCalledWith("01034");
    expect(mockGetOrderByNumber).toHaveBeenCalledWith("1034");
    expect(mockUpdateOrder).toHaveBeenCalledTimes(2);
  });

  it("returns 404 when the order does not exist", async () => {
    mockGetOrderByNumber.mockResolvedValue(null);
    const res = await post({ order_number: "JE1", note: "hello" });
    expect(res.status).toBe(404);
    expect(mockUpdateOrder).not.toHaveBeenCalled();
  });
});
