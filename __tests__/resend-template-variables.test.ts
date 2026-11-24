import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendOrderEmail } from "../lib/email-service";
import {
  buildFilmDetailsHtml,
  capResendTemplateVariables,
  RESEND_TEMPLATE_VARIABLE_LIMIT,
  truncateResendTemplateValue,
} from "../lib/resend-template-variables";
import type { FilmOrder, RollDetail } from "../lib/types";

const mockGetOrderById = vi.fn();
const mockGetOrdersByCustomerEmail = vi.fn();
const mockUpdateOrder = vi.fn();

vi.mock("@/lib/db", () => ({
  getOrderById: (...args: unknown[]) => mockGetOrderById(...args),
  getOrdersByCustomerEmail: (...args: unknown[]) => mockGetOrdersByCustomerEmail(...args),
  updateOrder: (...args: unknown[]) => mockUpdateOrder(...args),
}));

function roll(overrides: Partial<RollDetail> = {}): RollDetail {
  return {
    film_type: "35mm",
    film_process: "Color",
    film_stock: "Kodak Gold 200",
    scan_size: "High-Res",
    ...overrides,
  };
}

function makeOrder(overrides: Partial<FilmOrder> = {}): FilmOrder {
  return {
    id: "order-1286",
    order_number: "1286",
    customer_id: "cust-1",
    customer_name: "Jane Doe",
    customer_email: "jane@example.com",
    status: "Received by Yours",
    status_history: [],
    status_updated_at: new Date().toISOString(),
    film_type: "35mm",
    film_process: "Both",
    roll_count: 14,
    dropoff_date: "2026-11-20",
    dropoff_number: 1,
    ...overrides,
  };
}

function rollAccounting(html: string): { shown: number; omitted: number } {
  const text = html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
  let shown = 0;
  let omitted = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const more = trimmed.match(/^and (\d+) more rolls?$/);
    if (more) {
      omitted += Number(more[1]);
      continue;
    }
    const counted = trimmed.match(/^(\d+) x /);
    if (counted) {
      shown += Number(counted[1]);
      continue;
    }
    const summary = trimmed.match(/^(\d+) rolls?$/);
    if (summary) {
      omitted += Number(summary[1]);
      continue;
    }
    shown += 1;
  }
  return { shown, omitted };
}

function assertTagsIntact(html: string) {
  const stack: string[] = [];
  const voidTags = new Set(["br", "hr", "img", "wbr"]);
  let index = 0;
  while (index < html.length) {
    if (html[index] !== "<") {
      index += 1;
      continue;
    }
    const end = html.indexOf(">", index + 1);
    expect(end).toBeGreaterThan(index);
    const next = html.indexOf("<", index + 1);
    expect(next === -1 || end < next).toBe(true);
    const raw = html.slice(index + 1, end).trim();
    const name = raw.replace(/^\//, "").replace(/\/$/, "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    if (name && !raw.startsWith("!")) {
      if (raw.startsWith("/")) {
        expect(stack.at(-1)).toBe(name);
        stack.pop();
      } else if (!/\/\s*$/.test(raw) && !voidTags.has(name)) {
        stack.push(name);
      }
    }
    index = end + 1;
  }
  expect(stack).toEqual([]);
}

const CATALOG_STOCKS = [
  "Kodak Gold 200",
  "Kodak Portra 160",
  "Kodak Portra 400",
  "Kodak Portra 800",
  "Kodak UltraMax 400",
  "Kodak ColorPlus 200",
  "Kodak Ektar 100",
  "Kodak Tri-X 400",
  "Ilford HP5 Plus 400",
  "Cinestill 800T",
  "Cinestill 400D",
  "Fujifilm Superia 400",
  "Candido 400",
  "Phoenix 200 - Blue",
];

describe("film list template variables", () => {
  it("groups identical rolls and keeps a 14-roll both-process order in one short list", () => {
    const html = buildFilmDetailsHtml([
      ...Array.from({ length: 8 }, () => roll({ film_process: "Color" })),
      ...Array.from({ length: 6 }, () => roll({
        film_process: "Black & White",
        film_stock: "Ilford HP5 Plus 400",
      })),
    ]);

    expect(html.length).toBeLessThanOrEqual(RESEND_TEMPLATE_VARIABLE_LIMIT);
    expect(html).toContain("8 x ");
    expect(html).toContain("Kodak Gold 200");
    expect(html).toContain("35mm");
    expect(html).toContain("6 x ");
    expect(html).toContain("Ilford HP5 Plus 400");
    expect(html).toContain("Black &amp; White");
    expect(html).not.toMatch(/and \d+ more rolls?/);
    expect(html).not.toMatch(/Roll \d+:/);
    expect(html.match(/<a /g)?.length).toBe(2);
    const totals = rollAccounting(html);
    expect(totals.shown + totals.omitted).toBe(14);
    expect(totals.omitted).toBe(0);
    assertTagsIntact(html);
  });

  it("keeps links for 14 different catalog stocks", () => {
    const html = buildFilmDetailsHtml(CATALOG_STOCKS.map((film_stock, index) => roll({
      film_stock,
      film_process: index % 2 === 0 ? "Color" : "Black & White",
    })));

    expect(html.length).toBeLessThanOrEqual(RESEND_TEMPLATE_VARIABLE_LIMIT);
    expect(html).not.toMatch(/and \d+ more rolls?/);
    expect(html.match(/<a /g)?.length).toBe(14);
    expect(rollAccounting(html)).toEqual({ shown: 14, omitted: 0 });
    assertTagsIntact(html);
  });

  it("keeps a 40-roll order of the same stock on one line", () => {
    const html = buildFilmDetailsHtml(Array.from({ length: 40 }, () => roll({ film_process: "Both" })));

    expect(html.length).toBeLessThanOrEqual(RESEND_TEMPLATE_VARIABLE_LIMIT);
    expect(html).toContain("40 x ");
    expect(html).toContain("Kodak Gold 200");
    expect(html).toContain("Both");
    expect(html).not.toMatch(/and \d+ more rolls?/);
    expect(html.match(/<a /g)?.length).toBe(1);
    expect(rollAccounting(html)).toEqual({ shown: 40, omitted: 0 });
  });

  it("caps a 40-roll order of long unique names and keeps the roll total", () => {
    const html = buildFilmDetailsHtml(Array.from({ length: 40 }, (_, index) => roll({
      film_stock: `Custom emulsion ${String(index + 1).padStart(2, "0")} ${"handmade ".repeat(8)}`,
      film_type: index % 3 === 0 ? "120" : "35mm",
      film_process: index % 2 === 0 ? "Color" : "Black & White",
    })));

    expect(html.length).toBeLessThanOrEqual(RESEND_TEMPLATE_VARIABLE_LIMIT);
    expect(html).toMatch(/and \d+ more rolls$/);
    const totals = rollAccounting(html);
    expect(totals.shown).toBeGreaterThan(0);
    expect(totals.shown + totals.omitted).toBe(40);
    expect(html).not.toMatch(/Roll \d+:/);
    expect(html).not.toContain("The rest of this did not fit.");
    assertTagsIntact(html);
  });

  it("does not merge rolls that differ only by scan size or prints", () => {
    const html = buildFilmDetailsHtml([
      roll({ scan_size: "High-Res" }),
      roll({ scan_size: "Standard" }),
      roll({ scan_size: "High-Res", prints_4x6: true }),
    ]);

    expect(html).toContain("High-Res");
    expect(html).toContain("Standard");
    expect(html).toContain("4x6 prints");
    expect(rollAccounting(html)).toEqual({ shown: 3, omitted: 0 });
  });

  it("groups a misspelled stock with its corrected name", () => {
    const html = buildFilmDetailsHtml([
      roll({ film_stock: "Pheonix 200 - Blue", scan_size: undefined }),
      roll({ film_stock: "Phoenix 200 - Blue", scan_size: undefined }),
    ]);

    expect(html.startsWith("2 x ")).toBe(true);
    expect(html).toContain("Phoenix 200 - Blue");
    expect(html).not.toContain("Pheonix");
  });
});

describe("Resend template variable cap", () => {
  it("leaves a value at the limit unchanged and shortens anything longer", () => {
    const exact = "a".repeat(RESEND_TEMPLATE_VARIABLE_LIMIT);
    const longer = "word ".repeat(500);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const capped = capResendTemplateVariables({
      notes: exact,
      scan_notes: longer,
    }, { template: "scans_sent", orderNumber: "1286" });

    expect(capped.notes).toBe(exact);
    expect(capped.scan_notes.length).toBeLessThanOrEqual(RESEND_TEMPLATE_VARIABLE_LIMIT);
    expect(capped.scan_notes.endsWith("The rest of this did not fit.")).toBe(true);
    expect(capped.scan_notes).toMatch(/\S\nThe rest of this did not fit\.$/);
    expect(warn).toHaveBeenCalledWith(
      "[email] Shortened a template variable that was over 2000 characters:",
      expect.objectContaining({ key: "scan_notes", template: "scans_sent", orderNumber: "1286" }),
    );
    const details = warn.mock.calls.find((call) => call[1]?.key === "scan_notes")?.[1] as Record<string, unknown>;
    expect(details).not.toHaveProperty("value");
    expect(JSON.stringify(details)).not.toContain(longer.slice(0, 40));
    warn.mockRestore();
  });

  it("truncates HTML without splitting a tag and closes what it opened", () => {
    const html = `<p><a href="https://www.yoursdurham.com/shopping/p/${"kodak-gold-".repeat(80)}">Kodak Gold 200 ${"frame ".repeat(400)}</a></p>`;
    const shortened = truncateResendTemplateValue(html, 120);

    expect(shortened.length).toBeLessThanOrEqual(120);
    expect(shortened).toContain("The rest of this did not fit.");
    expect(shortened).not.toMatch(/<[^>]*$/);
    assertTagsIntact(shortened);

    const insideTag = truncateResendTemplateValue(
      `<a href="https://www.yoursdurham.com/shopping/p/${"very-long-".repeat(30)}">Kodak Gold 200</a>`,
      40,
    );
    expect(insideTag.length).toBeLessThanOrEqual(40);
    expect(insideTag).not.toContain("<a");
    expect(insideTag).toBe("<br>The rest of this did not fit.");
    assertTagsIntact(insideTag);
  });
});

describe("sendOrderEmail large orders", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_TEMPLATE_FILM_DROP_RECEIVED", "tmpl_drop_received");
    vi.stubEnv("RESEND_TEMPLATE_SCANS_SENT", "tmpl_scans_sent");
    vi.stubEnv("RESEND_FROM_EMAIL", "test@example.com");
    mockUpdateOrder.mockResolvedValue({});
    mockGetOrdersByCustomerEmail.mockResolvedValue([]);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  async function sentVariables(order: FilmOrder, template: string) {
    mockGetOrderById.mockResolvedValue(order);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-1" }),
    });
    global.fetch = fetchMock as typeof fetch;
    await sendOrderEmail(order.id, template);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      template: { variables: Record<string, string> };
    };
    return body.template.variables;
  }

  it("sends a 14-roll drop-off email with every variable under the limit", async () => {
    const variables = await sentVariables(makeOrder({
      roll_count: 14,
      roll_details: [
        ...Array.from({ length: 8 }, () => roll({ film_process: "Color" })),
        ...Array.from({ length: 6 }, () => roll({
          film_process: "Black & White",
          film_stock: "Kodak Tri-X 400",
        })),
      ],
      notes: "Please keep the sleeves together.",
    }), "film_drop_received");

    expect(variables.roll_count).toBe("14");
    expect(variables.film_details_html.length).toBeLessThanOrEqual(RESEND_TEMPLATE_VARIABLE_LIMIT);
    expect(variables.film_details_html).toContain("8 x ");
    expect(variables.film_details_html).toContain("6 x ");
    expect(variables.notes).toBe("Please keep the sleeves together.");
    expect(rollAccounting(variables.film_details_html)).toEqual({ shown: 14, omitted: 0 });
    for (const value of Object.values(variables)) {
      expect(value.length).toBeLessThanOrEqual(RESEND_TEMPLATE_VARIABLE_LIMIT);
    }
  });

  it("sends a 40-roll order and a long note without a variable over 2000 characters", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const note = `Please ${"handle each sleeve on its own. ".repeat(120)}`;
    const variables = await sentVariables(makeOrder({
      roll_count: 40,
      film_process: "Both",
      roll_details: Array.from({ length: 40 }, (_, index) => roll({
        film_stock: `Custom emulsion ${String(index + 1).padStart(2, "0")} ${"handmade ".repeat(8)}`,
        film_process: index < 20 ? "Color" : "Black & White",
      })),
      notes: note,
    }), "film_drop_received");

    expect(variables.roll_count).toBe("40");
    expect(variables.film_details_html).toMatch(/and \d+ more rolls$/);
    expect(rollAccounting(variables.film_details_html)).toMatchObject({
      omitted: expect.any(Number),
    });
    const totals = rollAccounting(variables.film_details_html);
    expect(totals.shown + totals.omitted).toBe(40);
    expect(variables.notes.length).toBeLessThanOrEqual(RESEND_TEMPLATE_VARIABLE_LIMIT);
    expect(variables.notes).toContain("The rest of this did not fit.");
    expect(variables.notes.length).toBeLessThan(note.length);
    for (const value of Object.values(variables)) {
      expect(value.length).toBeLessThanOrEqual(RESEND_TEMPLATE_VARIABLE_LIMIT);
    }
    expect(warn).toHaveBeenCalled();

    const scanNote = `Frame ${"12 was blank. ".repeat(200)}`;
    const scanVariables = await sentVariables(makeOrder({
      status: "Scans Sent",
      roll_count: 40,
      roll_details: Array.from({ length: 40 }, () => roll()),
      wetransfer_link: "https://wetransfer.com/downloads/abc",
      scan_notes: scanNote,
    }), "scans_sent");

    expect(scanVariables.roll_count).toBe("40");
    expect(scanVariables.film_details_html).toContain("40 x ");
    expect(scanVariables.film_details_html.length).toBeLessThanOrEqual(RESEND_TEMPLATE_VARIABLE_LIMIT);
    expect(scanVariables.scan_notes.length).toBeLessThanOrEqual(RESEND_TEMPLATE_VARIABLE_LIMIT);
    expect(scanVariables.scan_notes_html.length).toBeLessThanOrEqual(RESEND_TEMPLATE_VARIABLE_LIMIT);
    expect(scanVariables.scan_notes_html).toContain("The rest of this did not fit.");
    assertTagsIntact(scanVariables.scan_notes_html);
    for (const value of Object.values(scanVariables)) {
      expect(value.length).toBeLessThanOrEqual(RESEND_TEMPLATE_VARIABLE_LIMIT);
    }
    warn.mockRestore();
  });
});
