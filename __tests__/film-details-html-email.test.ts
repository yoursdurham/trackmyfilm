import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendOrderEmail } from "../lib/email-service";
import type { FilmOrder } from "../lib/types";

const mockGetOrderById = vi.fn();
const mockGetOrdersByCustomerEmail = vi.fn();
const mockUpdateOrder = vi.fn();

vi.mock("@/lib/db", () => ({
  getOrderById: (...args: unknown[]) => mockGetOrderById(...args),
  getOrdersByCustomerEmail: (...args: unknown[]) => mockGetOrdersByCustomerEmail(...args),
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
    film_process: "Color",
    roll_count: 4,
    dropoff_date: "2026-09-30",
    dropoff_number: 1,
    at_lab_email_sent_at: undefined,
    ...overrides,
  };
}

describe("sendOrderEmail film_details_html stock links", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_TEMPLATE_FILM_AT_LAB", "tmpl_at_lab");
    vi.stubEnv("RESEND_FROM_EMAIL", "test@example.com");
    mockUpdateOrder.mockResolvedValue({});
    mockGetOrdersByCustomerEmail.mockResolvedValue([]);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("links each roll stock to that format and leaves unmatched stocks as text", async () => {
    mockGetOrderById.mockResolvedValue(makeOrder({
      notes: "Leave the plain note alone",
      roll_details: [
        { film_type: "35mm", film_process: "Color", film_stock: "Kodak Portra 160", scan_size: "High-Res" },
        { film_type: "120", film_process: "Black & White", film_stock: "Kodak Portra 160", scan_size: "Standard" },
        { film_type: "120", film_process: "Color", film_stock: "Kodak UltraMax 400" },
        { film_type: "35mm", film_process: "Color", film_stock: "Fujifilm <Superia> & 400", prints_4x6: true },
      ],
    }));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-1" }),
    });
    global.fetch = fetchMock as typeof fetch;

    await sendOrderEmail("order-1", "film_at_lab");

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      template: { variables: Record<string, string> };
    };
    const html = body.template.variables.film_details_html;

    expect(html).toBe(
      [
        '<p style="margin:0 0 6px;padding:0;">Roll 1: 35mm / Color / High-Res / <a href="https://www.yoursdurham.com/shopping/p/kodak-portra-160-35mm" target="_blank" style="color:#1a1a1a;text-decoration:underline;">Kodak Portra 160</a></p>',
        '<p style="margin:0 0 6px;padding:0;">Roll 2: 120 / Black &amp; White / Standard / <a href="https://www.yoursdurham.com/shopping/p/kodak-portra-160-120" target="_blank" style="color:#1a1a1a;text-decoration:underline;">Kodak Portra 160</a></p>',
        '<p style="margin:0 0 6px;padding:0;">Roll 3: 120 / Color / Kodak UltraMax 400</p>',
        '<p style="margin:0 0 6px;padding:0;">Roll 4: 35mm / Color / Fujifilm &lt;Superia&gt; &amp; 400 + 4x6 Prints</p>',
      ].join(""),
    );
    expect(html).not.toContain("kodak-ultramax-400-35mm");
    expect(html).not.toContain("<Superia>");
    expect(body.template.variables.order_number).toBe("JE100");
    expect(body.template.variables.roll_count).toBe("4");
    expect(body.template.variables.first_name).toBe("Jane");
    expect(body.template.variables.notes).toBeUndefined();
    expect(body.template.variables.scan_notes).toBeUndefined();
    expect(body.template.variables.film_details).toBeUndefined();
  });
});
