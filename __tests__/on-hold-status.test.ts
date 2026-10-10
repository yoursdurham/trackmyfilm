import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateOrderStatus } from "../lib/status-update-service";
import { normalizeHoldReason } from "../lib/hold-reason";
import { getStatusOptionsForOrder } from "../lib/order-service";
import type { FilmOrder } from "../lib/types";

const mockGetOrderById = vi.fn();
const mockUpdateOrder = vi.fn();
const mockSendOrderEmail = vi.fn();

vi.mock("@/lib/db", () => ({
  getOrderById: (...args: unknown[]) => mockGetOrderById(...args),
  updateOrder: (...args: unknown[]) => mockUpdateOrder(...args),
}));

vi.mock("@/lib/email-service", () => ({
  EmailSendError: class EmailSendError extends Error {
    status: number;
    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
    }
  },
  sendOrderEmail: (...args: unknown[]) => mockSendOrderEmail(...args),
}));

function makeOrder(overrides: Partial<FilmOrder> = {}): FilmOrder {
  return {
    id: "order-1",
    order_number: "HK7998",
    customer_id: "cust-1",
    customer_name: "Hannah Kelly",
    customer_email: "hkelly@example.com",
    status: "Received at Lab",
    status_history: [{ status: "Received at Lab", changed_at: "2026-09-08T22:00:00.000Z" }],
    status_updated_at: "2026-09-08T22:00:00.000Z",
    film_type: "35mm",
    film_process: "Color",
    roll_count: 1,
    dropoff_date: "2026-09-07",
    dropoff_number: 1,
    at_lab_at: "2026-09-08T22:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeHoldReason", () => {
  it("stores a short reason and treats a blank reason as none", () => {
    expect(normalizeHoldReason("  lost at lab  ").reason).toBe("lost at lab");
    expect(normalizeHoldReason("waiting   on customer").reason).toBe("waiting on customer");
    expect(normalizeHoldReason("   ").reason).toBeNull();
    expect(normalizeHoldReason(null).reason).toBeNull();
    expect(normalizeHoldReason(undefined).reason).toBeNull();
  });

  it("rejects a reason that is not short text", () => {
    expect(normalizeHoldReason("x".repeat(201)).error).toMatch(/200/);
    expect(normalizeHoldReason(12).error).toMatch(/text/);
  });
});

describe("getStatusOptionsForOrder", () => {
  it("offers On Hold for scan orders and process-only orders", () => {
    expect(getStatusOptionsForOrder(makeOrder())).toEqual([
      "Received by Yours",
      "Received at Lab",
      "Scans Sent",
      "On Hold",
    ]);
    expect(getStatusOptionsForOrder(makeOrder({
      roll_details: [{ film_type: "35mm", film_process: "Color", scan_size: "Process Only" }],
    }))).toEqual([
      "Received by Yours",
      "Received at Lab",
      "Ready for Pickup",
      "On Hold",
    ]);
  });
});

describe("updateOrderStatus — On Hold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateOrder.mockImplementation(async (_id: string, data: Partial<FilmOrder>) => ({
      ...makeOrder(),
      ...data,
    }));
    mockSendOrderEmail.mockResolvedValue({ success: true, skipped: false });
  });

  it("parks any order with an optional reason and does not email", async () => {
    mockGetOrderById.mockResolvedValue(makeOrder());

    const result = await updateOrderStatus({
      order_id: "order-1",
      new_status: "On Hold",
      hold_reason: " lost at lab ",
      send_email: true,
    });

    expect(result.success).toBe(true);
    expect(result.email_sent).toBe(false);
    expect(mockSendOrderEmail).not.toHaveBeenCalled();
    const patch = mockUpdateOrder.mock.calls[0][1] as Partial<FilmOrder>;
    expect(patch.status).toBe("On Hold");
    expect(patch.hold_reason).toBe("lost at lab");
    expect(patch.status_history?.at(-1)?.status).toBe("On Hold");
    expect(patch.scans_sent_at).toBeUndefined();
  });

  it("parks a process-only order without requiring a reason", async () => {
    mockGetOrderById.mockResolvedValue(makeOrder({
      roll_details: [{ film_type: "35mm", film_process: "Color", scan_size: "Process Only" }],
    }));

    const result = await updateOrderStatus({
      order_id: "order-1",
      new_status: "On Hold",
    });

    expect(result.success).toBe(true);
    expect(mockSendOrderEmail).not.toHaveBeenCalled();
    const patch = mockUpdateOrder.mock.calls[0][1] as Partial<FilmOrder>;
    expect(patch.hold_reason).toBeNull();
  });

  it("updates only the reason when the order is already On Hold", async () => {
    mockGetOrderById.mockResolvedValue(makeOrder({
      status: "On Hold",
      hold_reason: "lost at lab",
    }));

    const result = await updateOrderStatus({
      order_id: "order-1",
      new_status: "On Hold",
      hold_reason: "waiting on customer",
    });

    expect(result.success).toBe(true);
    expect(result.email_sent).toBe(false);
    const patch = mockUpdateOrder.mock.calls[0][1] as Partial<FilmOrder>;
    expect(patch).toEqual({ hold_reason: "waiting on customer" });
    expect(patch.status_history).toBeUndefined();
  });

  it("moves back to a normal status, clears the reason, and emails as usual", async () => {
    mockGetOrderById.mockResolvedValue(makeOrder({
      status: "On Hold",
      hold_reason: "lost at lab",
    }));

    const result = await updateOrderStatus({
      order_id: "order-1",
      new_status: "Received at Lab",
    });

    expect(result.success).toBe(true);
    expect(result.email_sent).toBe(true);
    expect(mockSendOrderEmail).toHaveBeenCalledWith("order-1", "film_at_lab", {
      scanNotes: undefined,
    });
    const patch = mockUpdateOrder.mock.calls[0][1] as Partial<FilmOrder>;
    expect(patch.status).toBe("Received at Lab");
    expect(patch.hold_reason).toBeNull();
    expect(patch.at_lab_at).toBeTruthy();
  });

  it("still blocks Scans Sent for a process-only order that was On Hold", async () => {
    mockGetOrderById.mockResolvedValue(makeOrder({
      status: "On Hold",
      roll_details: [{ film_type: "35mm", film_process: "Color", scan_size: "Process Only" }],
    }));

    const result = await updateOrderStatus({
      order_id: "order-1",
      new_status: "Scans Sent",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Ready for Pickup/);
    expect(mockUpdateOrder).not.toHaveBeenCalled();
    expect(mockSendOrderEmail).not.toHaveBeenCalled();
  });

  it("saves On Hold when the reason column has not been added yet", async () => {
    mockGetOrderById.mockResolvedValue(makeOrder());
    mockUpdateOrder
      .mockRejectedValueOnce(new Error("Could not find the 'hold_reason' column of 'film_orders' in the schema cache"))
      .mockImplementationOnce(async (_id: string, data: Partial<FilmOrder>) => ({
        ...makeOrder(),
        ...data,
      }));

    const result = await updateOrderStatus({
      order_id: "order-1",
      new_status: "On Hold",
      hold_reason: "lost at lab",
    });

    expect(result.success).toBe(true);
    expect(result.warning).toMatch(/020_add_order_hold_reason/);
    const retry = mockUpdateOrder.mock.calls[1][1] as Partial<FilmOrder>;
    expect(retry.status).toBe("On Hold");
    expect(retry.hold_reason).toBeUndefined();
    expect(mockSendOrderEmail).not.toHaveBeenCalled();
  });
});
