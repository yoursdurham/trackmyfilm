import { describe, expect, it, vi, beforeEach } from "vitest";
import { PENDING_INTAKE_STATUS, ORDER_STATUS } from "../lib/constants";
import {
  filterOperationalOrders,
  isPendingIntakeOrder,
} from "../lib/pending-intake";
import { calculateTurnaroundForPeriod } from "../lib/turnaround-time";
import type { FilmOrder } from "../lib/types";

const mockCreateOrder = vi.fn();
const mockCreateCustomer = vi.fn();
const mockGetCustomerByEmailOrName = vi.fn();
const mockGetOrderByNumber = vi.fn();
const mockGetOrderByExternalImport = vi.fn();
const mockGetOrderById = vi.fn();
const mockUpdateOrder = vi.fn();
const mockUpdateCustomer = vi.fn();
const mockGetCustomerById = vi.fn();
const mockSendOrderEmail = vi.fn();

vi.mock("../lib/db", () => ({
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
  createCustomer: (...args: unknown[]) => mockCreateCustomer(...args),
  getCustomerByEmailOrName: (...args: unknown[]) => mockGetCustomerByEmailOrName(...args),
  getOrderByNumber: (...args: unknown[]) => mockGetOrderByNumber(...args),
  getOrderByExternalImport: (...args: unknown[]) => mockGetOrderByExternalImport(...args),
  getOrderById: (...args: unknown[]) => mockGetOrderById(...args),
  updateOrder: (...args: unknown[]) => mockUpdateOrder(...args),
  updateCustomer: (...args: unknown[]) => mockUpdateCustomer(...args),
  getCustomerById: (...args: unknown[]) => mockGetCustomerById(...args),
}));

vi.mock("../lib/email-service", () => ({
  sendOrderEmail: (...args: unknown[]) => mockSendOrderEmail(...args),
}));

import { importSquarespaceOrder, approvePendingIntakeOrder } from "../lib/pending-intake-service";
import { updateOrderStatus } from "../lib/status-update-service";

function baseOrder(overrides: Partial<FilmOrder> = {}): FilmOrder {
  return {
    id: "order-1",
    order_number: "SQ-100",
    customer_id: "cust-1",
    customer_name: "Jane Doe",
    customer_email: "jane@example.com",
    status: ORDER_STATUS.RECEIVED_BY_YOURS,
    status_history: [{ status: ORDER_STATUS.RECEIVED_BY_YOURS, changed_at: "2026-01-01T12:00:00.000Z" }],
    status_updated_at: "2026-01-01T12:00:00.000Z",
    film_type: "35mm",
    film_process: "Color",
    roll_count: 2,
    dropoff_date: "2026-01-01",
    dropoff_number: 1,
    received_by_yours_at: "2026-01-01T12:00:00.000Z",
    at_lab_at: "2026-01-02T12:00:00.000Z",
    scans_sent_at: "2026-01-05T12:00:00.000Z",
    ...overrides,
  };
}

describe("pending intake helpers", () => {
  it("detects pending intake orders", () => {
    expect(isPendingIntakeOrder({ pending_intake: true, status: PENDING_INTAKE_STATUS })).toBe(true);
    expect(isPendingIntakeOrder({ status: ORDER_STATUS.RECEIVED_BY_YOURS })).toBe(false);
  });

  it("excludes pending orders from operational lists and turnaround", () => {
    const pending = baseOrder({
      id: "p1",
      pending_intake: true,
      status: PENDING_INTAKE_STATUS,
      received_by_yours_at: undefined,
      at_lab_at: undefined,
      scans_sent_at: undefined,
    });
    const normal = baseOrder({ id: "n1" });
    expect(filterOperationalOrders([pending, normal])).toHaveLength(1);

    const stats = calculateTurnaroundForPeriod([pending, normal], "all");
    expect(stats.orderCount).toBe(1);
  });
});

describe("importSquarespaceOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrderByExternalImport.mockResolvedValue(null);
    mockGetOrderByNumber.mockResolvedValue(null);
    mockGetCustomerByEmailOrName.mockResolvedValue({
      id: "cust-1",
      first_name: "Jane",
      email: "jane@example.com",
      total_rolls: 0,
      total_dropoffs: 0,
    });
    mockCreateOrder.mockImplementation(async (data) => ({ id: "new-order", ...data }));
  });

  it("creates a pending intake order without received timestamp or email", async () => {
    const result = await importSquarespaceOrder({
      external_order_id: "SS-999",
      customer_name: "Jane Doe",
      customer_email: "jane@example.com",
      roll_count: 2,
      film_type: "35mm",
      film_process: "Color",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.order.pending_intake).toBe(true);
    expect(result.order.status).toBe(PENDING_INTAKE_STATUS);
    expect(result.order.received_by_yours_at).toBeUndefined();
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        pending_intake: true,
        status: PENDING_INTAKE_STATUS,
        status_history: [],
      })
    );
    expect(mockSendOrderEmail).not.toHaveBeenCalled();
  });
});

describe("approvePendingIntakeOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendOrderEmail.mockResolvedValue({ success: true });
    mockGetCustomerById.mockResolvedValue({
      id: "cust-1",
      total_rolls: 4,
      total_dropoffs: 2,
    });
  });

  it("transitions to Received by Yours, sets timestamp, and sends drop-off email once", async () => {
    const pending = baseOrder({
      pending_intake: true,
      status: PENDING_INTAKE_STATUS,
      status_history: [],
      received_by_yours_at: undefined,
      dropoff_number: 0,
    });

    mockGetOrderById
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(pending);

    mockUpdateOrder.mockImplementation(async (_id, patch) => ({
      ...pending,
      ...patch,
    }));

    const result = await approvePendingIntakeOrder("order-1", {
      roll_count: 3,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(mockUpdateOrder).toHaveBeenCalledWith(
      "order-1",
      expect.objectContaining({
        pending_intake: false,
        status: ORDER_STATUS.RECEIVED_BY_YOURS,
        dropoff_number: 3,
      })
    );
    expect(result.order.received_by_yours_at).toBeTruthy();
    expect(mockSendOrderEmail).toHaveBeenCalledTimes(1);
    expect(mockSendOrderEmail).toHaveBeenCalledWith("order-1", "film_drop_received");
    expect(result.email_sent).toBe(true);
  });

  it("allows editing roll count before approval", async () => {
    const pending = baseOrder({
      pending_intake: true,
      status: PENDING_INTAKE_STATUS,
      status_history: [],
      received_by_yours_at: undefined,
    });
    mockGetOrderById.mockResolvedValue(pending);
    mockUpdateOrder.mockImplementation(async (_id, patch) => ({ ...pending, ...patch }));

    await approvePendingIntakeOrder("order-1", { roll_count: 5 });

    expect(mockUpdateOrder).toHaveBeenCalledWith(
      "order-1",
      expect.objectContaining({ roll_count: 5 })
    );
  });
});

describe("manual workflow unchanged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks status updates while order is still pending intake", async () => {
    mockGetOrderById.mockResolvedValue(
      baseOrder({
        pending_intake: true,
        status: PENDING_INTAKE_STATUS,
        status_history: [],
      })
    );

    const result = await updateOrderStatus({
      order_id: "order-1",
      new_status: ORDER_STATUS.RECEIVED_AT_LAB,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Pending Intake/i);
    expect(mockUpdateOrder).not.toHaveBeenCalled();
  });

  it("does not treat normal orders as pending", async () => {
    const manual = baseOrder({ pending_intake: false });
    expect(isPendingIntakeOrder(manual)).toBe(false);
  });
});
