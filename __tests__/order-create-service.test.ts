import { describe, expect, it, vi, beforeEach } from "vitest";
import { ORDER_STATUS, PENDING_INTAKE_STATUS } from "../lib/constants";

const mockCreateOrder = vi.fn();
const mockCreateCustomer = vi.fn();
const mockGetCustomerByEmailOrName = vi.fn();
const mockGetOrderByNumber = vi.fn();
const mockGetOrderByExternalImport = vi.fn();
const mockUpdateCustomer = vi.fn();
const mockSendOrderEmail = vi.fn();

vi.mock("../lib/db", () => ({
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
  createCustomer: (...args: unknown[]) => mockCreateCustomer(...args),
  getCustomerByEmailOrName: (...args: unknown[]) => mockGetCustomerByEmailOrName(...args),
  getOrderByNumber: (...args: unknown[]) => mockGetOrderByNumber(...args),
  getOrderByExternalImport: (...args: unknown[]) => mockGetOrderByExternalImport(...args),
  updateCustomer: (...args: unknown[]) => mockUpdateCustomer(...args),
}));

vi.mock("../lib/email-service", () => ({
  sendOrderEmail: (...args: unknown[]) => mockSendOrderEmail(...args),
}));

import {
  createTrackMyFilmOrder,
  squarespaceImportToCreateInput,
} from "../lib/order-create-service";
import { importSquarespaceOrder } from "../lib/pending-intake-service";

const baseInput = {
  customer_name: "Jane Doe",
  customer_email: "jane@example.com",
  order_number: "JE1001",
  dropoff_date: "2026-10-01",
  roll_count: 2,
  film_type: "35mm",
  film_process: "Color",
};

describe("createTrackMyFilmOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrderByNumber.mockResolvedValue(null);
    mockGetOrderByExternalImport.mockResolvedValue(null);
    mockGetCustomerByEmailOrName.mockResolvedValue({
      id: "cust-1",
      first_name: "Jane",
      total_rolls: 4,
      total_dropoffs: 2,
    });
    mockCreateOrder.mockImplementation(async (data: Record<string, unknown>) => ({
      id: "order-new",
      ...data,
    }));
    mockUpdateCustomer.mockResolvedValue({});
    mockSendOrderEmail.mockResolvedValue({ success: true });
  });

  it("manual_received sets Received by Yours, timestamp, totals, and email", async () => {
    const result = await createTrackMyFilmOrder(baseInput, {
      intake_mode: "manual_received",
      send_email: true,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ORDER_STATUS.RECEIVED_BY_YOURS,
        pending_intake: false,
        dropoff_number: 3,
        received_by_yours_at: expect.any(String),
        status_history: [{ status: ORDER_STATUS.RECEIVED_BY_YOURS, changed_at: expect.any(String) }],
      })
    );
    expect(mockUpdateCustomer).toHaveBeenCalledWith(
      "cust-1",
      expect.objectContaining({ total_dropoffs: 3, total_rolls: 6 })
    );
    expect(mockSendOrderEmail).toHaveBeenCalledWith("order-new", "film_drop_received");
    expect(result.customer_total_dropoffs).toBe(3);
  });

  it("pending_import creates Pending Intake without timestamp, totals update, or email", async () => {
    const result = await createTrackMyFilmOrder(
      {
        ...baseInput,
        order_number: "SQ-EXT-1",
        import: { import_source: "squarespace", external_order_id: "EXT-1" },
      },
      { intake_mode: "pending_import", send_email: false }
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        status: PENDING_INTAKE_STATUS,
        pending_intake: true,
        dropoff_number: 0,
        status_history: [],
        import_source: "squarespace",
        external_order_id: "EXT-1",
        imported_at: expect.any(String),
      })
    );
    expect(mockCreateOrder.mock.calls[0][0].received_by_yours_at).toBeUndefined();
    expect(mockUpdateCustomer).not.toHaveBeenCalled();
    expect(mockSendOrderEmail).not.toHaveBeenCalled();
  });

  it("rejects duplicate external import ids", async () => {
    mockGetOrderByExternalImport.mockResolvedValue({ id: "existing" });

    const result = await createTrackMyFilmOrder(
      {
        ...baseInput,
        import: { import_source: "squarespace", external_order_id: "DUP" },
      },
      { intake_mode: "pending_import" }
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.status).toBe(409);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });
});

describe("importSquarespaceOrder uses shared createTrackMyFilmOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrderByNumber.mockResolvedValue(null);
    mockGetOrderByExternalImport.mockResolvedValue(null);
    mockGetCustomerByEmailOrName.mockResolvedValue({
      id: "cust-1",
      first_name: "Jane",
      total_rolls: 0,
      total_dropoffs: 0,
    });
    mockCreateOrder.mockImplementation(async (data: Record<string, unknown>) => ({
      id: "order-import",
      ...data,
    }));
  });

  it("maps Squarespace payload and creates pending import", async () => {
    const mapped = squarespaceImportToCreateInput({
      external_order_id: "SS-42",
      customer_name: "Jane Doe",
      customer_email: "jane@example.com",
      roll_count: 1,
      film_type: "35mm",
      film_process: "Color",
    });
    expect(mapped.order_number).toBe("SQ-SS-42");
    expect(mapped.import?.external_order_id).toBe("SS-42");

    const result = await importSquarespaceOrder({
      external_order_id: "SS-42",
      customer_name: "Jane Doe",
      customer_email: "jane@example.com",
      roll_count: 1,
      film_type: "35mm",
      film_process: "Color",
    });

    expect(result.success).toBe(true);
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ pending_intake: true, status: PENDING_INTAKE_STATUS })
    );
  });
});
