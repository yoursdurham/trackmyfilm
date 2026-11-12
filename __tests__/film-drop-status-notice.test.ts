import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendOrderEmail } from "../lib/email-service";
import {
  FILM_DROP_STATUS_NOTICE,
  FILM_DROP_STATUS_NOTICE_VARIABLES,
  filmDropStatusNotice,
} from "../lib/film-drop-status-notice";
import type { FilmOrder } from "../lib/types";

const EXPIRY = new Date("2026-11-18T00:00:00-05:00");
const BEFORE = new Date("2026-11-12T15:00:00-05:00");
const LAST_MOMENT = new Date("2026-11-17T23:59:59-05:00");
const AFTER = new Date("2026-11-18T00:00:01-05:00");

const HEADING = "Status update";
const MESSAGE =
  "Heads up: we're skipping this Friday's lab run. Your film will head to the lab on Tuesday, Nov 17.";

function assertShopName(copy: string) {
  expect(copy).not.toMatch(/Yours,\s*\./);
  expect(copy).not.toMatch(/Yours(?!,)/);
}

describe("film drop status notice", () => {
  it("shows the notice before end of day Tuesday Nov 17, 2026 America/New_York", () => {
    expect(Date.parse(FILM_DROP_STATUS_NOTICE.expiresAt)).toBe(EXPIRY.getTime());
    expect(EXPIRY.toISOString()).toBe("2026-11-18T05:00:00.000Z");

    for (const now of [BEFORE, LAST_MOMENT]) {
      const notice = filmDropStatusNotice(now);
      expect(notice.text).toBe(`${HEADING}\n${MESSAGE}\n\n`);
      expect(notice.html).toContain(`<h2`);
      expect(notice.html).toContain(HEADING);
      expect(notice.html).toContain(MESSAGE);
      expect(notice.html.startsWith("<tr>")).toBe(true);
      expect(notice.html.endsWith("</tr>")).toBe(true);
      expect(notice.html).toContain('role="presentation"');
      expect(notice.html).toContain('lang="en"');
      expect(notice.html).toContain('dir="ltr"');
      expect(notice.html).toContain("background-color:#FFF6D3");
      expect(notice.html).toContain("bgcolor=\"#FFF6D3\"");
      expect(notice.html).toContain("border-color:#DDB1B1");
      expect(notice.html).toContain("JetBrains Mono");
      expect(notice.html).not.toMatch(/display:\s*flex|display:\s*grid/);
      expect(notice.html.length).toBeLessThanOrEqual(2000);
      expect(notice.text.length).toBeLessThanOrEqual(2000);
      assertShopName(notice.text);
      assertShopName(notice.html);
    }
  });

  it("hides the notice at expiry and after", () => {
    for (const now of [EXPIRY, AFTER]) {
      expect(filmDropStatusNotice(now)).toEqual({ html: "", text: "" });
    }
  });
});

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
    status_updated_at: "2026-11-12T15:00:00.000Z",
    film_type: "35mm",
    film_process: "Color",
    roll_count: 1,
    dropoff_date: "2026-11-12",
    dropoff_number: 1,
    ...overrides,
  };
}

describe("sendOrderEmail film_drop_received — status notice", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_TEMPLATE_FILM_DROP_RECEIVED", "tmpl_drop_received");
    vi.stubEnv("RESEND_TEMPLATE_SCANS_SENT", "tmpl_scans_sent");
    vi.stubEnv("RESEND_FROM_EMAIL", "test@example.com");
    mockUpdateOrder.mockResolvedValue({});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  async function sentVariables(template: string) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-notice" }),
    });
    global.fetch = fetchMock as typeof fetch;
    await sendOrderEmail("order-1", template);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      template: { variables: Record<string, string> };
    };
    return body.template.variables;
  }

  it("sends the notice on a drop-off email before expiry and omits it after", async () => {
    mockGetOrderById.mockResolvedValue(makeOrder());

    vi.setSystemTime(BEFORE);
    const shown = await sentVariables("film_drop_received");
    expect(shown[FILM_DROP_STATUS_NOTICE_VARIABLES.html]).toContain(HEADING);
    expect(shown[FILM_DROP_STATUS_NOTICE_VARIABLES.html]).toContain(MESSAGE);
    expect(shown[FILM_DROP_STATUS_NOTICE_VARIABLES.text]).toBe(`${HEADING}\n${MESSAGE}\n\n`);

    vi.setSystemTime(AFTER);
    const hidden = await sentVariables("film_drop_received");
    expect(hidden[FILM_DROP_STATUS_NOTICE_VARIABLES.html]).toBe("");
    expect(hidden[FILM_DROP_STATUS_NOTICE_VARIABLES.text]).toBe("");
  });

  it("does not add the notice to other status emails", async () => {
    vi.setSystemTime(BEFORE);
    mockGetOrderById.mockResolvedValue(makeOrder({
      status: "Scans Sent",
      wetransfer_link: "https://wetransfer.com/downloads/abc",
    }));

    const variables = await sentVariables("scans_sent");
    expect(variables[FILM_DROP_STATUS_NOTICE_VARIABLES.html]).toBeUndefined();
    expect(variables[FILM_DROP_STATUS_NOTICE_VARIABLES.text]).toBeUndefined();
  });
});
