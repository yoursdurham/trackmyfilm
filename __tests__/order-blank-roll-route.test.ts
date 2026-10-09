import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequireAuth = vi.fn();
const mockUpdateOrder = vi.fn();
const mockGetOrderById = vi.fn();
const mockGetOrderByNumber = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock("@/lib/db", () => ({
  getOrderById: (...args: unknown[]) => mockGetOrderById(...args),
  getOrderByNumber: (...args: unknown[]) => mockGetOrderByNumber(...args),
  updateOrder: (...args: unknown[]) => mockUpdateOrder(...args),
  deleteOrder: vi.fn(),
  deleteIncomingDraftsForOrder: vi.fn(),
  getCustomerById: vi.fn(),
  updateCustomer: vi.fn(),
}));

import { PATCH } from "@/app/api/orders/[id]/route";

const ORDER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("PATCH /api/orders/[id] blank rolls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: "user-1", email: "staff@example.com" });
    mockUpdateOrder.mockImplementation(async (_id: string, patch: unknown) => ({ id: ORDER_ID, ...(patch as object) }));
  });

  function patch(body: unknown) {
    return PATCH(new Request(`http://localhost/api/orders/${ORDER_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: ORDER_ID }) });
  }

  it("returns 401 and does not write when there is no staff session", async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const res = await patch({
      roll_details: [{ film_type: "35mm", film_process: "Color", blank: true }],
    });

    expect(res.status).toBe(401);
    expect(mockUpdateOrder).not.toHaveBeenCalled();
  });

  it("stores blank on one roll and drops the key when it is cleared", async () => {
    const res = await patch({
      roll_details: [
        { film_type: "35mm", film_process: "Color", blank: true },
        { film_type: "120", film_process: "Black & White", blank: false, scan_size: "Standard" },
      ],
    });

    expect(res.status).toBe(200);
    expect(mockUpdateOrder).toHaveBeenCalledTimes(1);
    const saved = mockUpdateOrder.mock.calls[0][1].roll_details;
    expect(saved[0].blank).toBe(true);
    expect(saved[1].blank).toBeUndefined();
    expect(saved[1].film_type).toBe("120");
    expect(saved[1].scan_size).toBe("Standard");
  });

  it("rejects a non-boolean blank flag without writing", async () => {
    const res = await patch({
      roll_details: [{ film_type: "35mm", film_process: "Color", blank: "yes" }],
    });

    expect(res.status).toBe(400);
    expect(mockUpdateOrder).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      error: "roll_details[0].blank must be a boolean",
    });
  });
});
