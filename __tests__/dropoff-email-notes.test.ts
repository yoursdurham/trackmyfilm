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
    status: "Received by Yours",
    status_history: [],
    status_updated_at: new Date().toISOString(),
    film_type: "35mm",
    film_process: "Color",
    roll_count: 1,
    dropoff_date: "2026-09-30",
    dropoff_number: 1,
    ...overrides,
  };
}

describe("sendOrderEmail film_drop_received — notes variable", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_TEMPLATE_FILM_DROP_RECEIVED", "tmpl_drop_received");
    vi.stubEnv("RESEND_FROM_EMAIL", "test@example.com");
    mockUpdateOrder.mockResolvedValue({});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("passes order notes to the Resend template", async () => {
    mockGetOrderById.mockResolvedValue(makeOrder({
      notes: "  Please handle with care.  ",
      received_email_sent_at: undefined,
    }));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-1" }),
    });
    global.fetch = fetchMock as typeof fetch;

    await sendOrderEmail("order-1", "film_drop_received");

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      template: { variables: Record<string, string> };
    };
    expect(body.template.variables.notes).toBe("Please handle with care.");
  });

  it("sends empty notes when none on the order", async () => {
    mockGetOrderById.mockResolvedValue(makeOrder({
      notes: undefined,
      received_email_sent_at: undefined,
    }));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-2" }),
    });
    global.fetch = fetchMock as typeof fetch;

    await sendOrderEmail("order-1", "film_drop_received");

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      template: { variables: Record<string, string> };
    };
    expect(body.template.variables.notes).toBe("");
  });

  it("does not add notes variable for scans_sent", async () => {
    vi.stubEnv("RESEND_TEMPLATE_SCANS_SENT", "tmpl_scans_sent");
    mockGetOrderById.mockResolvedValue(makeOrder({
      status: "Scans Sent",
      notes: "Drop-off note",
      wetransfer_link: "https://wetransfer.com/x",
      scans_sent_email_sent_at: undefined,
    }));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-3" }),
    });
    global.fetch = fetchMock as typeof fetch;

    await sendOrderEmail("order-1", "scans_sent");

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      template: { variables: Record<string, string> };
    };
    expect(body.template.variables.notes).toBeUndefined();
    expect(body.template.variables.scan_notes).toBeDefined();
  });
});
