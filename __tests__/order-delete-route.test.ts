import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequireAuth = vi.fn();
const mockGetOrderById = vi.fn();
const mockDeleteOrder = vi.fn();
const mockDeleteIncomingDraftsForOrder = vi.fn();
const mockGetCustomerById = vi.fn();
const mockUpdateCustomer = vi.fn();
const mockUpdateOrder = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock("@/lib/db", () => ({
  getOrderById: (...args: unknown[]) => mockGetOrderById(...args),
  updateOrder: (...args: unknown[]) => mockUpdateOrder(...args),
  deleteOrder: (...args: unknown[]) => mockDeleteOrder(...args),
  deleteIncomingDraftsForOrder: (...args: unknown[]) => mockDeleteIncomingDraftsForOrder(...args),
  getCustomerById: (...args: unknown[]) => mockGetCustomerById(...args),
  updateCustomer: (...args: unknown[]) => mockUpdateCustomer(...args),
}));

import { DELETE } from "@/app/api/orders/[id]/route";

const ORDER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("DELETE /api/orders/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: "user-1" });
    mockGetOrderById.mockResolvedValue({
      id: ORDER_ID,
      order_number: "01050",
      customer_id: "cust-1",
      roll_count: 1,
    });
    mockDeleteIncomingDraftsForOrder.mockResolvedValue(undefined);
    mockDeleteOrder.mockResolvedValue(undefined);
    mockGetCustomerById.mockResolvedValue({ id: "cust-1", total_rolls: 3, total_dropoffs: 2 });
    mockUpdateCustomer.mockResolvedValue({});
  });

  function remove() {
    return DELETE(new Request(`http://localhost/api/orders/${ORDER_ID}`, { method: "DELETE" }), {
      params: Promise.resolve({ id: ORDER_ID }),
    });
  }

  it("requires a staff session", async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    const res = await remove();
    expect(res.status).toBe(401);
    expect(mockDeleteIncomingDraftsForOrder).not.toHaveBeenCalled();
    expect(mockDeleteOrder).not.toHaveBeenCalled();
  });

  it("returns 404 and does not touch intake rows when the order is missing", async () => {
    mockGetOrderById.mockResolvedValue(null);
    const res = await remove();
    expect(res.status).toBe(404);
    expect(mockDeleteIncomingDraftsForOrder).not.toHaveBeenCalled();
    expect(mockDeleteOrder).not.toHaveBeenCalled();
  });

  it("deletes the matching intake row before the film order", async () => {
    const res = await remove();
    expect(res.status).toBe(200);
    expect(mockDeleteIncomingDraftsForOrder).toHaveBeenCalledWith({
      id: ORDER_ID,
      order_number: "01050",
    });
    expect(mockDeleteOrder).toHaveBeenCalledWith(ORDER_ID);
    expect(mockDeleteIncomingDraftsForOrder.mock.invocationCallOrder[0])
      .toBeLessThan(mockDeleteOrder.mock.invocationCallOrder[0]);
    expect(mockUpdateCustomer).toHaveBeenCalledWith("cust-1", {
      total_rolls: 2,
      total_dropoffs: 1,
    });
  });

  it("leaves the film order in place when intake cleanup fails", async () => {
    mockDeleteIncomingDraftsForOrder.mockRejectedValue(new Error("db down"));
    const res = await remove();
    expect(res.status).toBe(500);
    expect(mockDeleteOrder).not.toHaveBeenCalled();
    expect(mockUpdateCustomer).not.toHaveBeenCalled();
  });
});
