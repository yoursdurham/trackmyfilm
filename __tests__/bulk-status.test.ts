import { beforeEach, describe, expect, it, vi } from "vitest";
import { ORDER_STATUS } from "../lib/constants";
import type { FilmOrder } from "../lib/types";

const batchSend = vi.fn();
const mockGetOrdersByIds = vi.fn();
const mockGetOrderById = vi.fn();
const mockGetOrdersByCustomerEmail = vi.fn();
const mockUpdateOrder = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    batch = { send: (...args: unknown[]) => batchSend(...args) };
  },
}));

vi.mock("@/lib/db", () => ({
  getOrdersByIds: (...args: unknown[]) => mockGetOrdersByIds(...args),
  getOrderById: (...args: unknown[]) => mockGetOrderById(...args),
  getOrdersByCustomerEmail: (...args: unknown[]) => mockGetOrdersByCustomerEmail(...args),
  updateOrder: (...args: unknown[]) => mockUpdateOrder(...args),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: vi.fn(async () => ({ id: "staff-1", email: "staff@example.com" })),
}));

import { POST } from "../app/api/orders/bulk-status-update/route";
import { bulkUpdateOrderStatus, formatBulkStatusSummary } from "../lib/bulk-status";
import { updateOrderStatus } from "../lib/status-update-service";
import {
  batchIdempotencyKey,
  orderStatusIdempotencyKey,
  statusEmailBatchTiming,
} from "../lib/status-email-batch";

function makeOrder(id: string, overrides: Partial<FilmOrder> = {}): FilmOrder {
  return {
    id,
    order_number: `A${id.slice(-4)}`,
    customer_id: "cust-1",
    customer_name: "Avery Sample",
    customer_email: "avery.sample@example.com",
    status: "Received by Yours",
    status_history: [],
    status_updated_at: "2026-10-01T15:00:00.000Z",
    film_type: "35mm",
    film_process: "Color",
    roll_count: 1,
    dropoff_date: "2026-10-01",
    dropoff_number: 1,
    received_by_yours_at: "2026-10-01T15:00:00.000Z",
    ...overrides,
  };
}

function acceptedBatch(count: number) {
  return {
    data: { data: Array.from({ length: count }, (_, index) => ({ id: `email-${index}` })), errors: [] },
    error: null,
  };
}

describe("bulk status emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_TEMPLATE_FILM_AT_LAB", "tmpl_at_lab");
    vi.stubEnv("RESEND_FROM_EMAIL", "lab@example.com");
    mockGetOrdersByCustomerEmail.mockResolvedValue([]);
    mockUpdateOrder.mockImplementation(async (id: string, data: Partial<FilmOrder>) => ({
      ...makeOrder(id),
      ...data,
    }));
    vi.spyOn(statusEmailBatchTiming, "sleep").mockResolvedValue();
  });

  it("describes a clean move and a partial email failure", () => {
    expect(formatBulkStatusSummary({
      emailsOnly: false,
      sendsEmail: true,
      movedCount: 24,
      skippedCount: 0,
      statusFailureCount: 0,
      emailsSent: 24,
      emailsFailed: 0,
      emailsSkipped: 0,
    })).toBe("Moved 24 orders, 24 emails sent");

    expect(formatBulkStatusSummary({
      emailsOnly: false,
      sendsEmail: true,
      movedCount: 24,
      skippedCount: 0,
      statusFailureCount: 0,
      emailsSent: 22,
      emailsFailed: 2,
      emailsSkipped: 0,
    })).toBe("Moved 24 orders, 22 emails sent, 2 emails failed");
  });

  it("builds a stable idempotency key from each order and status move", () => {
    const anchor = "2026-10-27T18:00:00.000Z";
    const first = orderStatusIdempotencyKey("order-a", ORDER_STATUS.RECEIVED_AT_LAB, anchor);
    expect(first).toBe(orderStatusIdempotencyKey("order-a", ORDER_STATUS.RECEIVED_AT_LAB, anchor));
    expect(first).not.toBe(orderStatusIdempotencyKey("order-a", ORDER_STATUS.RECEIVED_AT_LAB, "other-time"));
    expect(batchIdempotencyKey(["b", "a"])).toBe(batchIdempotencyKey(["a", "b"]));
  });

  it("saves every status before sending email, and a Resend 429 does not undo the move", async () => {
    const orders = [makeOrder("order-a"), makeOrder("order-b")];
    mockGetOrdersByIds.mockResolvedValue(orders);
    const events: string[] = [];
    mockUpdateOrder.mockImplementation(async (id: string, data: Partial<FilmOrder>) => {
      events.push(data.status ? `status:${id}` : `email:${id}`);
      return { ...makeOrder(id), ...data };
    });
    batchSend.mockImplementation(async () => {
      events.push("batch");
      if (batchSend.mock.calls.length === 1) {
        return {
          data: null,
          error: { name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" },
        };
      }
      return acceptedBatch(2);
    });

    const result = await bulkUpdateOrderStatus({
      orderIds: ["order-a", "order-b"],
      status: ORDER_STATUS.RECEIVED_AT_LAB,
    });

    expect(result.movedCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(result.emailsSent).toBe(2);
    expect(result.summary).toBe("Moved 2 orders, 2 emails sent");
    const firstBatch = events.indexOf("batch");
    expect(firstBatch).toBeGreaterThan(0);
    expect(events.slice(0, firstBatch).filter((event) => event.startsWith("status:")).sort()).toEqual([
      "status:order-a",
      "status:order-b",
    ]);
    expect(events.slice(0, firstBatch).some((event) => event.startsWith("email:"))).toBe(false);
    expect(batchSend).toHaveBeenCalledTimes(2);
    expect(batchSend.mock.calls[0][1].idempotencyKey).toBe(batchSend.mock.calls[1][1].idempotencyKey);
    expect(statusEmailBatchTiming.sleep).toHaveBeenCalledWith(1000);
    const reverted = mockUpdateOrder.mock.calls.filter((call) => call[1]?.status === ORDER_STATUS.RECEIVED_BY_YOURS);
    expect(reverted).toHaveLength(0);
  });

  it("keeps a saved status when one email in the batch is rejected", async () => {
    mockGetOrdersByIds.mockResolvedValue([makeOrder("order-a"), makeOrder("order-b")]);
    batchSend.mockResolvedValue({
      data: {
        data: [{ id: "email-a" }],
        errors: [{ index: 1, message: "Invalid `to` field." }],
      },
      error: null,
    });

    const result = await bulkUpdateOrderStatus({
      orderIds: ["order-a", "order-b"],
      status: ORDER_STATUS.RECEIVED_AT_LAB,
    });

    expect(result.success).toBe(true);
    expect(result.movedCount).toBe(2);
    expect(result.emailsSent).toBe(1);
    expect(result.emailFailures).toEqual([
      expect.objectContaining({ orderId: "order-b", error: "Invalid `to` field." }),
    ]);
    expect(result.summary).toBe("Moved 2 orders, 1 email sent, 1 email failed");
    expect(mockUpdateOrder.mock.calls.filter((call) => call[1]?.status === ORDER_STATUS.RECEIVED_AT_LAB)).toHaveLength(2);
  });

  it("still moves the other orders when one status write throws", async () => {
    mockGetOrdersByIds.mockResolvedValue([makeOrder("order-a"), makeOrder("order-b")]);
    mockUpdateOrder.mockImplementation(async (id: string, data: Partial<FilmOrder>) => {
      if (id === "order-b" && data.status) throw new Error("database unavailable");
      return { ...makeOrder(id), ...data };
    });
    batchSend.mockResolvedValue(acceptedBatch(1));

    const result = await bulkUpdateOrderStatus({
      orderIds: ["order-a", "order-b"],
      status: ORDER_STATUS.RECEIVED_AT_LAB,
    });

    expect(result.movedCount).toBe(1);
    expect(result.failures).toEqual([
      expect.objectContaining({ orderId: "order-b", error: "database unavailable" }),
    ]);
    expect(result.emailsSent).toBe(1);
    expect(batchSend.mock.calls[0][0]).toHaveLength(1);
    expect(result.summary).toBe("Moved 1 order, 1 not moved, 1 email sent");
  });

  it("does not send again when the status email timestamp is already set", async () => {
    mockGetOrdersByIds.mockResolvedValue([
      makeOrder("order-a", { at_lab_email_sent_at: new Date().toISOString() }),
    ]);

    const result = await bulkUpdateOrderStatus({
      orderIds: ["order-a"],
      status: ORDER_STATUS.RECEIVED_AT_LAB,
    });

    expect(result.movedCount).toBe(1);
    expect(result.emailsSent).toBe(0);
    expect(result.emailsSkipped).toBe(1);
    expect(batchSend).not.toHaveBeenCalled();
    expect(result.summary).toBe("Moved 1 order, 1 email already sent");
  });

  it("retries unsent emails without writing the status again", async () => {
    mockGetOrdersByIds.mockResolvedValue([
      makeOrder("order-a", {
        status: ORDER_STATUS.RECEIVED_AT_LAB,
        at_lab_at: "2026-10-27T18:00:00.000Z",
      }),
    ]);
    batchSend.mockResolvedValue(acceptedBatch(1));

    const result = await bulkUpdateOrderStatus({
      orderIds: ["order-a"],
      status: ORDER_STATUS.RECEIVED_AT_LAB,
      emailsOnly: true,
    });

    expect(result.movedCount).toBe(0);
    expect(result.emailsSent).toBe(1);
    expect(result.summary).toBe("Retried emails: 1 email sent");
    expect(mockUpdateOrder.mock.calls.every((call) => call[1]?.status === undefined)).toBe(true);
    expect(mockUpdateOrder).toHaveBeenCalledWith("order-a", expect.objectContaining({
      email_status: "sent",
      at_lab_email_sent_at: expect.any(String),
    }));
    expect(batchSend.mock.calls[0][1].idempotencyKey).toBe(
      orderStatusIdempotencyKey("order-a", ORDER_STATUS.RECEIVED_AT_LAB, "2026-10-27T18:00:00.000Z"),
    );
  });

  it("uses the same status-then-email path for a bulk move that does not email", async () => {
    mockGetOrdersByIds.mockResolvedValue([makeOrder("order-a"), makeOrder("order-b")]);

    const result = await bulkUpdateOrderStatus({
      orderIds: ["order-b", "order-a"],
      status: ORDER_STATUS.ON_HOLD,
    });

    expect(result.movedCount).toBe(2);
    expect(result.emailsSent).toBe(0);
    expect(result.summary).toBe("Moved 2 orders");
    expect(batchSend).not.toHaveBeenCalled();
    expect(mockUpdateOrder.mock.calls.filter((call) => call[1]?.status === ORDER_STATUS.ON_HOLD)).toHaveLength(2);
  });

  it("returns the summary from the bulk route when an email fails", async () => {
    mockGetOrdersByIds.mockResolvedValue([makeOrder("order-a")]);
    batchSend.mockResolvedValue({
      data: { data: [], errors: [{ index: 0, message: "rate limit on this email" }] },
      error: null,
    });

    const res = await POST(new Request("http://localhost/api/orders/bulk-status-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderIds: ["order-a"],
        status: ORDER_STATUS.RECEIVED_AT_LAB,
      }),
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movedCount).toBe(1);
    expect(body.emailsFailed).toBe(1);
    expect(body.summary).toBe("Moved 1 order, 0 emails sent, 1 email failed");
    expect(body.success).toBe(true);
  });

  it("keeps a single-order status change when email bookkeeping throws", async () => {
    mockGetOrderById.mockResolvedValue(makeOrder("order-a"));
    mockUpdateOrder.mockImplementation(async (id: string, data: Partial<FilmOrder>) => {
      if (data.email_status) throw new Error("bookkeeping failed");
      return { ...makeOrder(id), ...data };
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("429 Too many requests")));

    const result = await updateOrderStatus({
      order_id: "order-a",
      new_status: ORDER_STATUS.RECEIVED_AT_LAB,
    });

    expect(result.success).toBe(true);
    expect(result.email_sent).toBe(false);
    expect(result.new_status).toBe(ORDER_STATUS.RECEIVED_AT_LAB);
    expect(mockUpdateOrder).toHaveBeenCalledWith("order-a", expect.objectContaining({
      status: ORDER_STATUS.RECEIVED_AT_LAB,
    }));
  });
});
