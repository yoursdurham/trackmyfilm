import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendOrderEmail } from "../lib/email-service";
import type { FilmOrder } from "../lib/types";

const mockGetOrderById = vi.fn();
const mockUpdateOrder = vi.fn();

vi.mock("@/lib/db", () => ({
  getOrderById: (...args: unknown[]) => mockGetOrderById(...args),
  updateOrder: (...args: unknown[]) => mockUpdateOrder(...args),
}));

function makeOrder(overrides: Partial<FilmOrder> = {}): FilmOrder {
  return {
    id: "order-1",
    order_number: "JE100",
    customer_id: "cust-1",
    customer_name: "Jane Doe",
    customer_email: "jane@example.com",
    status: "Scans Sent",
    status_history: [],
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

describe("sendOrderEmail scans_sent — scan_notes variable", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_TEMPLATE_SCANS_SENT", "tmpl_scans_sent");
    vi.stubEnv("RESEND_FROM_EMAIL", "test@example.com");
    mockUpdateOrder.mockResolvedValue({});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("passes saved scan_notes to the Resend template", async () => {
    mockGetOrderById.mockResolvedValue(makeOrder({
      scan_notes: "The B&W roll was heavily underexposed.",
      scans_sent_email_sent_at: undefined,
    }));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-1" }),
    });
    global.fetch = fetchMock as typeof fetch;

    await sendOrderEmail("order-1", "scans_sent");

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      template: { variables: Record<string, string> };
    };
    expect(body.template.variables.scan_notes).toBe("The B&W roll was heavily underexposed.");
    expect(body.template.variables.scan_notes_html).toContain("heavily underexposed");
  });

  it("uses scanNotes override when provided (same send as status update)", async () => {
    mockGetOrderById.mockResolvedValue(makeOrder({
      scan_notes: null,
      scans_sent_email_sent_at: undefined,
    }));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-1b" }),
    });
    global.fetch = fetchMock as typeof fetch;

    await sendOrderEmail("order-1", "scans_sent", {
      scanNotes: "Fresh note from the dialog",
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      template: { variables: Record<string, string> };
    };
    expect(body.template.variables.scan_notes).toBe("Fresh note from the dialog");
  });

  it("passes empty scan_notes when none saved (retry/resend path)", async () => {
    mockGetOrderById.mockResolvedValue(makeOrder({
      scan_notes: null,
      scans_sent_email_sent_at: undefined,
    }));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-2" }),
    });
    global.fetch = fetchMock as typeof fetch;

    await sendOrderEmail("order-1", "scans_sent");

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      template: { variables: Record<string, string> };
    };
    expect(body.template.variables.scan_notes).toBe("");
  });
});
