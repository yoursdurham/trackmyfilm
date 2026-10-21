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
    status: "Received at Lab",
    status_history: [],
    status_updated_at: new Date().toISOString(),
    film_type: "35mm",
    film_process: "Both",
    roll_count: 2,
    dropoff_date: "2026-09-30",
    dropoff_number: 1,
    color_scans_wetransfer_link: "https://wetransfer.com/color",
    bw_scans_wetransfer_link: "https://wetransfer.com/bw",
    ...overrides,
  };
}

describe("sendOrderEmail partial_scans_sent — scan_type variable", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_TEMPLATE_PARTIAL_SCANS_SENT", "tmpl_partial_scans");
    vi.stubEnv("RESEND_FROM_EMAIL", "test@example.com");
    mockUpdateOrder.mockResolvedValue({});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  async function sentVariables(batch: "Color" | "Black & White") {
    mockGetOrderById.mockResolvedValue(makeOrder());
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-1" }),
    });
    global.fetch = fetchMock as typeof fetch;

    await sendOrderEmail("order-1", "partial_scans_sent", { partialBatch: batch });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      template: { variables: Record<string, string> };
    };
    return body.template.variables;
  }

  it("sends scan_type color and keeps batch_label for the color link", async () => {
    const variables = await sentVariables("Color");
    expect(variables.scan_type).toBe("color");
    expect(variables.batch_label).toBe("Color");
    expect(variables.wetransfer_link).toBe("https://wetransfer.com/color");
  });

  it("sends scan_type B&W and keeps batch_label for the black-and-white link", async () => {
    const variables = await sentVariables("Black & White");
    expect(variables.scan_type).toBe("B&W");
    expect(variables.batch_label).toBe("Black & White");
    expect(variables.wetransfer_link).toBe("https://wetransfer.com/bw");
  });
});
