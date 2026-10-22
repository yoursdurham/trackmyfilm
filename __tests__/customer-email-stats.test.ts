import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeCustomerEmailStats } from "../lib/customer-email-stats";
import { sendOrderEmail } from "../lib/email-service";
import type { FilmOrder } from "../lib/types";

const NOW = new Date("2026-10-22T15:00:00.000Z");

function order(overrides: Partial<FilmOrder> = {}): FilmOrder {
  return {
    id: "order-1",
    order_number: "JE100",
    customer_id: "cust-1",
    customer_name: "Jane Doe",
    customer_email: "jane@example.com",
    status: "Received by Yours",
    status_history: [],
    status_updated_at: "2026-10-22T15:00:00.000Z",
    film_type: "35mm",
    film_process: "Color",
    roll_count: 1,
    dropoff_date: "2026-10-22",
    dropoff_number: 1,
    received_by_yours_at: "2026-10-22T15:00:00.000Z",
    ...overrides,
  };
}

describe("computeCustomerEmailStats", () => {
  it("returns blank strings when there are no orders", () => {
    expect(computeCustomerEmailStats([], NOW)).toEqual({
      rolls_dropped_off: "",
      top_stock: "",
      days_since_first_drop: "",
    });
  });

  it("still returns values for a customer's first order on the same day", () => {
    const stats = computeCustomerEmailStats([
      order({
        roll_count: 2,
        film_stock: "Kodak Gold 200",
        roll_details: [
          { film_type: "35mm", film_process: "Color", film_stock: "Kodak Gold 200" },
          { film_type: "35mm", film_process: "Color", film_stock: "Kodak Gold 200" },
        ],
      }),
    ], NOW);

    expect(stats.rolls_dropped_off).toBe("2");
    expect(stats.top_stock).toBe("Kodak Gold 200");
    expect(stats.days_since_first_drop).toBe("0");
  });

  it("sums non-blank rolls across orders, including the current one", () => {
    const stats = computeCustomerEmailStats([
      order({
        id: "older",
        roll_count: 3,
        received_by_yours_at: "2026-10-01T16:00:00.000Z",
        roll_details: [
          { film_type: "35mm", film_process: "Color", film_stock: "Kodak Portra 400" },
          { film_type: "35mm", film_process: "Color", film_stock: "Kodak Portra 400", blank: true },
          { film_type: "35mm", film_process: "Black & White", film_stock: "Kodak Tri-X 400" },
        ],
      }),
      order({
        id: "current",
        roll_count: 1,
        film_stock: "Kodak Portra 400",
        roll_details: [
          { film_type: "35mm", film_process: "Color", film_stock: "Kodak Portra 400" },
        ],
      }),
    ], NOW);

    expect(stats.rolls_dropped_off).toBe("3");
    expect(stats.top_stock).toBe("Kodak Portra 400");
    expect(stats.days_since_first_drop).toBe("21");
  });

  it("uses roll_count and order film stock when an older order has no roll details", () => {
    const stats = computeCustomerEmailStats([
      order({
        id: "legacy",
        roll_count: 4,
        film_stock: "Kodak Gold 200",
        roll_details: undefined,
        received_by_yours_at: "2026-09-01T16:00:00.000Z",
      }),
      order({
        id: "current",
        roll_count: 1,
        roll_details: [
          { film_type: "35mm", film_process: "Color", film_stock: "Kodak Portra 400" },
        ],
      }),
    ], NOW);

    expect(stats.rolls_dropped_off).toBe("5");
    expect(stats.top_stock).toBe("Kodak Gold 200");
  });

  it("breaks a stock tie with the most recent roll", () => {
    const stats = computeCustomerEmailStats([
      order({
        id: "older",
        received_by_yours_at: "2026-08-01T16:00:00.000Z",
        roll_count: 2,
        roll_details: [
          { film_type: "35mm", film_process: "Color", film_stock: "Kodak Gold 200" },
          { film_type: "35mm", film_process: "Color", film_stock: "Kodak Gold 200" },
        ],
      }),
      order({
        id: "newer",
        received_by_yours_at: "2026-10-10T16:00:00.000Z",
        roll_count: 2,
        roll_details: [
          { film_type: "120", film_process: "Color", film_stock: "Kodak Portra 400" },
          { film_type: "120", film_process: "Color", film_stock: "Kodak Portra 400" },
        ],
      }),
    ], NOW);

    expect(stats.top_stock).toBe("Kodak Portra 400");
  });

  it("breaks a same-order stock tie with the later roll", () => {
    const stats = computeCustomerEmailStats([
      order({
        roll_count: 2,
        roll_details: [
          { film_type: "35mm", film_process: "Color", film_stock: "Kodak Gold 200" },
          { film_type: "35mm", film_process: "Color", film_stock: "Kodak Portra 400" },
        ],
      }),
    ], NOW);

    expect(stats.top_stock).toBe("Kodak Portra 400");
  });

  it("counts whole New York calendar days, not elapsed hours", () => {
    const stats = computeCustomerEmailStats([
      order({
        received_by_yours_at: "2026-10-22T03:30:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        dropoff_date: "2020-01-01",
      }),
    ], new Date("2026-10-22T06:00:00.000Z"));

    expect(stats.days_since_first_drop).toBe("1");
  });

  it("uses created_at when the order was never marked received", () => {
    const stats = computeCustomerEmailStats([
      order({
        received_by_yours_at: undefined,
        created_at: "2026-10-20T03:00:00.000Z",
        dropoff_date: "2026-01-01",
      }),
    ], NOW);

    expect(stats.days_since_first_drop).toBe("3");
  });

  it("leaves days blank when no order has a received or created date", () => {
    const stats = computeCustomerEmailStats([
      order({
        received_by_yours_at: undefined,
        created_at: undefined,
        roll_count: 1,
        film_stock: "Kodak Gold 200",
      }),
    ], NOW);

    expect(stats.rolls_dropped_off).toBe("1");
    expect(stats.days_since_first_drop).toBe("");
  });
});

const mockGetOrderById = vi.fn();
const mockGetOrdersByCustomerEmail = vi.fn();
const mockUpdateOrder = vi.fn();

vi.mock("@/lib/db", () => ({
  getOrderById: (...args: unknown[]) => mockGetOrderById(...args),
  getOrdersByCustomerEmail: (...args: unknown[]) => mockGetOrdersByCustomerEmail(...args),
  updateOrder: (...args: unknown[]) => mockUpdateOrder(...args),
}));

describe("sendOrderEmail customer stats variables", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_TEMPLATE_FILM_AT_LAB", "tmpl_at_lab");
    vi.stubEnv("RESEND_FROM_EMAIL", "test@example.com");
    mockUpdateOrder.mockResolvedValue({});
    mockGetOrderById.mockResolvedValue(order({
      customer_email: "Jane@Example.com",
      at_lab_email_sent_at: undefined,
      roll_details: [
        { film_type: "35mm", film_process: "Color", film_stock: "Kodak Gold 200" },
      ],
    }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    mockGetOrdersByCustomerEmail.mockReset();
  });

  it("passes the three stats on a template that has no other extra variables", async () => {
    const history = [
      order({
        id: "older",
        customer_email: "JANE@example.com",
        received_by_yours_at: "2026-10-01T16:00:00.000Z",
        roll_count: 1,
        roll_details: [
          { film_type: "35mm", film_process: "Color", film_stock: "Kodak Gold 200" },
        ],
      }),
      order({
        customer_email: "jane@example.com",
        roll_details: [
          { film_type: "35mm", film_process: "Color", film_stock: "Kodak Gold 200" },
        ],
      }),
    ];
    mockGetOrdersByCustomerEmail.mockResolvedValue(history);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-1" }),
    });
    global.fetch = fetchMock as typeof fetch;

    await sendOrderEmail("order-1", "film_at_lab");

    expect(mockGetOrdersByCustomerEmail).toHaveBeenCalledWith("jane@example.com");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      template: { variables: Record<string, string> };
    };
    const expected = computeCustomerEmailStats(history);
    expect(body.template.variables.rolls_dropped_off).toBe(expected.rolls_dropped_off);
    expect(body.template.variables.top_stock).toBe(expected.top_stock);
    expect(body.template.variables.days_since_first_drop).toBe(expected.days_since_first_drop);
    expect(body.template.variables.rolls_dropped_off).toBe("2");
    expect(body.template.variables.top_stock).toBe("Kodak Gold 200");
  });

  it("sends the email with empty stats when the lookup throws", async () => {
    mockGetOrdersByCustomerEmail.mockRejectedValue(new Error("database unavailable"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-2" }),
    });
    global.fetch = fetchMock as typeof fetch;

    const result = await sendOrderEmail("order-1", "film_at_lab");

    expect(result).toMatchObject({ success: true, template: "film_at_lab" });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      template: { variables: Record<string, string> };
    };
    expect(body.template.variables.rolls_dropped_off).toBe("");
    expect(body.template.variables.top_stock).toBe("");
    expect(body.template.variables.days_since_first_drop).toBe("");
    errorSpy.mockRestore();
  });
});
