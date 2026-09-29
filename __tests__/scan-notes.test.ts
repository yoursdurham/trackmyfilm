import { describe, it, expect, vi, beforeEach } from "vitest";
import { scanNotesForEmail, scanNotesForStorage, scanNotesHtml } from "../lib/scan-notes";
import { updateOrderStatus } from "../lib/status-update-service";
import { isProcessOnlyOrder } from "../lib/order-service";
import { scansSentBlockedReason } from "../lib/scan-batch";
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
    order_number: "JE100",
    customer_id: "cust-1",
    customer_name: "Jane Doe",
    customer_email: "jane@example.com",
    status: "Received at Lab",
    status_history: [{ status: "Received at Lab", changed_at: new Date().toISOString() }],
    status_updated_at: new Date().toISOString(),
    film_type: "35mm",
    film_process: "Color",
    roll_count: 1,
    dropoff_date: "2026-09-29",
    dropoff_number: 1,
    wetransfer_link: "https://wetransfer.com/downloads/abc",
    ...overrides,
  };
}

describe("scanNotesForEmail / scanNotesForStorage", () => {
  it("treats null, undefined, and empty as no note", () => {
    expect(scanNotesForEmail(null)).toBe("");
    expect(scanNotesForEmail(undefined)).toBe("");
    expect(scanNotesForEmail("")).toBe("");
    expect(scanNotesForEmail("   ")).toBe("");
    expect(scanNotesForStorage("")).toBeNull();
  });

  it("trims stored and email values", () => {
    expect(scanNotesForEmail("  Roll 2 had light leaks.  ")).toBe("Roll 2 had light leaks.");
    expect(scanNotesForStorage("  note  ")).toBe("note");
  });

  it("scanNotesHtml is empty without a note", () => {
    expect(scanNotesHtml(null)).toBe("");
  });

  it("scanNotesHtml escapes and preserves line breaks", () => {
    const html = scanNotesHtml("Line 1\nLine <2>");
    expect(html).toContain("Line 1<br />Line &lt;2&gt;");
  });
});

describe("updateOrderStatus — Scans Sent scan_notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateOrder.mockImplementation(async (_id: string, data: Partial<FilmOrder>) => ({
      ...makeOrder(),
      ...data,
    }));
    mockSendOrderEmail.mockResolvedValue({ success: true, skipped: false });
  });

  it("saves scan_notes when marking Scans Sent with a note", async () => {
    mockGetOrderById.mockResolvedValue(makeOrder());

    const result = await updateOrderStatus({
      order_id: "order-1",
      new_status: "Scans Sent",
      wetransfer_link: "https://wetransfer.com/downloads/xyz",
      scan_notes: "Roll 2 had significant light leaks.",
      send_email: false,
    });

    expect(result.success).toBe(true);
    expect(mockUpdateOrder).toHaveBeenCalledTimes(1);
    const patch = mockUpdateOrder.mock.calls[0][1] as Partial<FilmOrder>;
    expect(patch.scan_notes).toBe("Roll 2 had significant light leaks.");
    expect(patch.status).toBe("Scans Sent");
    expect(patch.scans_sent_at).toBeTruthy();
  });

  it("passes scan_notes into sendOrderEmail when email is sent", async () => {
    mockGetOrderById.mockResolvedValue(makeOrder());

    await updateOrderStatus({
      order_id: "order-1",
      new_status: "Scans Sent",
      wetransfer_link: "https://wetransfer.com/downloads/xyz",
      scan_notes: "Check roll 3 exposure.",
      send_email: true,
    });

    expect(mockSendOrderEmail).toHaveBeenCalledWith("order-1", "scans_sent", {
      scanNotes: "Check roll 3 exposure.",
    });
  });

  it("clears scan_notes in DB when an empty note is submitted", async () => {
    mockGetOrderById.mockResolvedValue(makeOrder({ scan_notes: "old note" }));

    await updateOrderStatus({
      order_id: "order-1",
      new_status: "Scans Sent",
      wetransfer_link: "https://wetransfer.com/downloads/xyz",
      scan_notes: "   ",
      send_email: false,
    });

    const patch = mockUpdateOrder.mock.calls[0][1] as Partial<FilmOrder>;
    expect(patch.scan_notes).toBeNull();
  });

  it("does not set scan_notes when transitioning to Received at Lab", async () => {
    mockGetOrderById.mockResolvedValue(makeOrder({ status: "Received by Yours" }));

    await updateOrderStatus({
      order_id: "order-1",
      new_status: "Received at Lab",
      scan_notes: "should not save",
      send_email: false,
    });

    const patch = mockUpdateOrder.mock.calls[0][1] as Partial<FilmOrder>;
    expect(patch.scan_notes).toBeUndefined();
  });

  it("rejects Scans Sent for process-only orders", async () => {
    const processOnly = makeOrder({
      roll_details: [{ film_type: "35mm", film_process: "Color", scan_size: "Process Only" }],
    });
    mockGetOrderById.mockResolvedValue(processOnly);
    expect(isProcessOnlyOrder(processOnly)).toBe(true);

    const result = await updateOrderStatus({
      order_id: "order-1",
      new_status: "Scans Sent",
      scan_notes: "ignored",
    });

    expect(result.success).toBe(false);
    expect(mockUpdateOrder).not.toHaveBeenCalled();
  });
});

describe("partial scan workflow unchanged", () => {
  it("still blocks Scans Sent when mixed batches are incomplete", () => {
    const mixed = makeOrder({
      roll_details: [
        { film_type: "35mm", film_process: "Color", scan_size: "Standard" },
        { film_type: "35mm", film_process: "Black & White", scan_size: "Standard" },
      ],
    });
    expect(scansSentBlockedReason(mixed, false)).toMatch(/partial scans/i);
  });
});
