import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const {
  mockRequireAuth,
  mockOrderNumberExists,
  mockGetIncomingDraftByOrderNumber,
  mockGetIncomingDraftByExternalId,
  mockCreateIncomingDraft,
  mockCreateOrder,
  mockSendOrderEmail,
} = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockOrderNumberExists: vi.fn(),
  mockGetIncomingDraftByOrderNumber: vi.fn(),
  mockGetIncomingDraftByExternalId: vi.fn(),
  mockCreateIncomingDraft: vi.fn(),
  mockCreateOrder: vi.fn(),
  mockSendOrderEmail: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock("@/lib/db", () => ({
  orderNumberExists: (...args: unknown[]) => mockOrderNumberExists(...args),
  getIncomingDraftByOrderNumber: (...args: unknown[]) => mockGetIncomingDraftByOrderNumber(...args),
  getIncomingDraftByExternalId: (...args: unknown[]) => mockGetIncomingDraftByExternalId(...args),
  createIncomingDraft: (...args: unknown[]) => mockCreateIncomingDraft(...args),
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
}));

vi.mock("@/lib/email-service", () => ({
  sendOrderEmail: (...args: unknown[]) => mockSendOrderEmail(...args),
}));

import { POST } from "@/app/api/incoming-drafts/check/route";
import {
  buildSquarespaceOrdersUrl,
  classifySquarespaceOrder,
  fetchRecentSquarespaceOrders,
  filmTypeFromProductName,
  isFilmProcessingProductName,
  isSquarespacePosOrder,
  SQUARESPACE_API_KEY_ENV,
  SQUARESPACE_LOOKBACK_DAYS,
  SQUARESPACE_USER_AGENT,
  squarespaceLookbackWindow,
} from "../lib/squarespace-orders";
import { importSquarespaceOrders } from "../lib/squarespace-import";
import { orderNumbersMatch } from "../lib/validation";

const ORDER_ID = "585d498fdee9f31a60284a37";

function filmOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    orderNumber: "01050",
    customerEmail: "contact@justineisner.com",
    createdOn: "2026-10-01T15:00:00.000Z",
    channel: "web",
    channelName: "Squarespace",
    fulfillmentStatus: "FULFILLED",
    billingAddress: { firstName: "Justin", lastName: "Eisner" },
    lineItems: [
      {
        productName: "C41 (color) - 35mm Development",
        quantity: 1,
        variantOptions: [
          { optionName: "Processing", value: "Dev + High Res Scan" },
          { optionName: "4x6 Prints", value: "Yes" },
          { optionName: "Film Stock", value: "Kodak Portra 800" },
        ],
      },
      {
        productName: "Kodak Portra 400 35mm",
        quantity: 2,
      },
    ],
    ...overrides,
  };
}

describe("film processing product names", () => {
  it("recognizes C41, black and white, 35mm, 120, and 110 development", () => {
    expect(isFilmProcessingProductName("C41 (color) - 35mm Development")).toBe(true);
    expect(isFilmProcessingProductName("C-41 (color) - 120 Development")).toBe(true);
    expect(isFilmProcessingProductName("Black & White - 120 Development")).toBe(true);
    expect(isFilmProcessingProductName("Black and White - 110 Development")).toBe(true);
    expect(filmTypeFromProductName("C41 (color) - 35mm Development")).toBe("35mm");
    expect(filmTypeFromProductName("C-41 (color) - 120 Development")).toBe("120");
    expect(filmTypeFromProductName("Black and White - 110 Development")).toBe("110");
  });

  it("ignores film and camera shop sales", () => {
    expect(isFilmProcessingProductName("Kodak Portra 400 35mm")).toBe(false);
    expect(isFilmProcessingProductName("35mm Film")).toBe(false);
    expect(isFilmProcessingProductName("Canon AE-1 Camera")).toBe(false);
    expect(isFilmProcessingProductName("C41 Color Negative Film")).toBe(false);
  });
});

describe("classifySquarespaceOrder", () => {
  it("maps a fulfilled C41 35mm high-res print order and ignores the film sale", () => {
    const result = classifySquarespaceOrder(filmOrder());
    expect(result.kind).toBe("import");
    if (result.kind !== "import") return;
    expect(result.draft).toMatchObject({
      squarespace_order_number: "01050",
      external_order_id: ORDER_ID,
      import_source: "squarespace",
      customer_name: "Justin Eisner",
      customer_email: "contact@justineisner.com",
      dropoff_date: "2026-10-01",
      roll_count: 1,
    });
    expect(result.draft.roll_details).toEqual([{
      film_type: "35mm",
      film_process: "Color",
      scan_size: "High-Res",
      prints_4x6: true,
      film_stock: "Kodak Portra 800",
    }]);
    expect(result.draft).not.toHaveProperty("status");
  });

  it("imports pending and canceled orders the same way", () => {
    expect(classifySquarespaceOrder(filmOrder({ fulfillmentStatus: "PENDING" })).kind).toBe("import");
    expect(classifySquarespaceOrder(filmOrder({ fulfillmentStatus: "CANCELED" })).kind).toBe("import");
  });

  it("maps black and white 120 standard scans with quantity as roll count", () => {
    const result = classifySquarespaceOrder(filmOrder({
      orderNumber: "01051",
      id: "bw-order",
      fulfillmentStatus: "PENDING",
      lineItems: [{
        productName: "Black & White - 120 Development",
        quantity: 2,
        variantOptions: [
          { optionName: "Processing", value: "Dev + Standard Scan" },
          { optionName: "4x6 Prints", value: "No" },
        ],
      }],
    }));
    expect(result.kind).toBe("import");
    if (result.kind !== "import") return;
    expect(result.draft.roll_count).toBe(2);
    expect(result.draft.roll_details).toEqual([
      { film_type: "120", film_process: "Black & White", scan_size: "Standard", prints_4x6: false },
      { film_type: "120", film_process: "Black & White", scan_size: "Standard", prints_4x6: false },
    ]);
  });

  it("maps 110 development", () => {
    const result = classifySquarespaceOrder(filmOrder({
      lineItems: [{
        productName: "Black and White - 110 Development",
        quantity: 1,
        variantOptions: [{ optionName: "Processing", value: "Dev + Standard Scan" }],
      }],
    }));
    expect(result.kind).toBe("import");
    if (result.kind !== "import") return;
    expect(result.draft.roll_details[0].film_type).toBe("110");
    expect(result.draft.roll_details[0].film_process).toBe("Black & White");
  });

  it("skips Point of Sale orders even when they include film development", () => {
    expect(isSquarespacePosOrder({ channel: "pos" })).toBe(true);
    expect(isSquarespacePosOrder({ channel: "POS" })).toBe(true);
    expect(isSquarespacePosOrder({ channel: "web", channelName: "Point of Sale" })).toBe(true);
    expect(isSquarespacePosOrder({ channelName: "point-of-sale" })).toBe(true);
    expect(isSquarespacePosOrder({ channel: "web", channelName: "Squarespace" })).toBe(false);

    for (const overrides of [
      { channel: "pos", channelName: "Point of Sale" },
      { channel: "POS" },
      { channel: "web", channelName: "Point of Sale" },
    ]) {
      const result = classifySquarespaceOrder(filmOrder(overrides));
      expect(result.kind).toBe("skip_pos");
    }

    const web = classifySquarespaceOrder(filmOrder({ channel: "web" }));
    expect(web.kind).toBe("import");
    if (web.kind !== "import") return;
    expect(web.draft.squarespace_order_number).toBe("01050");
  });

  it("skips an order that is only a shop sale", () => {
    const result = classifySquarespaceOrder(filmOrder({
      lineItems: [{ productName: "Canon AE-1 Camera", quantity: 1 }],
    }));
    expect(result.kind).toBe("skip_no_film");
  });

  it("reports a development line that has no film size", () => {
    const result = classifySquarespaceOrder(filmOrder({
      orderNumber: "01052",
      lineItems: [{ productName: "C41 Development", quantity: 1 }],
    }));
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.orderNumber).toBe("01052");
    expect(result.message).toMatch(/film type/i);
  });
});

describe("buildSquarespaceOrdersUrl", () => {
  it("time-boxes the first page and does not filter fulfillment status", () => {
    const now = new Date("2026-10-04T12:00:00.000Z");
    const window = squarespaceLookbackWindow(now);
    expect(window.modifiedBefore).toBe("2026-10-04T12:00:00.000Z");
    const after = new Date(window.modifiedAfter);
    expect(now.getTime() - after.getTime()).toBe(SQUARESPACE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const url = new URL(buildSquarespaceOrdersUrl(window));
    expect(url.origin + url.pathname).toBe("https://api.squarespace.com/1.0/commerce/orders");
    expect(url.searchParams.get("modifiedAfter")).toBe(window.modifiedAfter);
    expect(url.searchParams.get("modifiedBefore")).toBe(window.modifiedBefore);
    expect(url.searchParams.has("fulfillmentStatus")).toBe(false);
    expect(url.searchParams.has("cursor")).toBe(false);
  });

  it("sends only the cursor on later pages", () => {
    const url = new URL(buildSquarespaceOrdersUrl({
      cursor: "next-cursor",
      modifiedAfter: "2026-01-01T00:00:00.000Z",
      modifiedBefore: "2026-10-04T00:00:00.000Z",
    }));
    expect(url.searchParams.get("cursor")).toBe("next-cursor");
    expect(url.searchParams.has("modifiedAfter")).toBe(false);
    expect(url.searchParams.has("fulfillmentStatus")).toBe(false);
  });
});

describe("importSquarespaceOrders", () => {
  const deps = {
    orderNumberExists: vi.fn(),
    getIncomingDraftByOrderNumber: vi.fn(),
    getIncomingDraftByExternalId: vi.fn(),
    createIncomingDraft: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    deps.orderNumberExists.mockResolvedValue(false);
    deps.getIncomingDraftByOrderNumber.mockResolvedValue(null);
    deps.getIncomingDraftByExternalId.mockResolvedValue(null);
    deps.createIncomingDraft.mockImplementation(async (data: unknown) => data);
  });

  it("imports a new film order and skips shop sales, duplicates, and save races", async () => {
    deps.orderNumberExists.mockImplementation(async (orderNumber: string) => orderNumber === "01060");
    deps.getIncomingDraftByOrderNumber.mockImplementation(async (orderNumber: string) => (
      orderNumber === "01061" ? { id: "draft-accepted", status: "accepted" } : null
    ));
    deps.getIncomingDraftByExternalId.mockImplementation(async (externalId: string) => (
      externalId === "external-dup" ? { id: "draft-accepted", status: "accepted" } : null
    ));
    const unique = new Error('duplicate key value violates unique constraint "incoming_squarespace_drafts_order_number_idx"') as Error & { code?: string };
    unique.code = "23505";
    deps.createIncomingDraft.mockImplementation(async (data: { squarespace_order_number: string }) => {
      if (data.squarespace_order_number === "01062") throw unique;
      return data;
    });

    const summary = await importSquarespaceOrders([
      filmOrder(),
      filmOrder({ id: "pos-order", orderNumber: "01058", channel: "pos", channelName: "Point of Sale" }),
      filmOrder({ id: "shop-only", orderNumber: "01059", lineItems: [{ productName: "Kodak Gold 200", quantity: 1 }] }),
      filmOrder({ id: "existing-order", orderNumber: "01060" }),
      filmOrder({ id: "existing-draft", orderNumber: "01061" }),
      filmOrder({ id: "external-dup", orderNumber: "01063" }),
      filmOrder({ id: "race", orderNumber: "01062" }),
    ], deps);

    expect(summary.imported).toBe(1);
    expect(summary.importedOrderNumbers).toEqual(["01050"]);
    expect(summary.skippedNoFilm).toBe(1);
    expect(summary.skippedPos).toBe(1);
    expect(summary.skippedDuplicate).toBe(4);
    expect(summary.errors).toEqual([]);
    expect(deps.createIncomingDraft).toHaveBeenCalledTimes(2);
    const inserted = deps.createIncomingDraft.mock.calls[0][0];
    expect(inserted.external_order_id).toBe(ORDER_ID);
    expect(inserted.roll_details[0].film_process).toBe("Color");
  });

  it("skips 01034 when 1034 already exists, and 1034 when 01034 already exists", async () => {
    const filmOrders = ["1034", "01037"];
    const drafts = ["01035"];
    deps.orderNumberExists.mockImplementation(async (orderNumber: string) => (
      filmOrders.some((stored) => orderNumbersMatch(stored, orderNumber))
    ));
    deps.getIncomingDraftByOrderNumber.mockImplementation(async (orderNumber: string) => (
      drafts.some((stored) => orderNumbersMatch(stored, orderNumber))
        ? { id: "draft-padded", status: "Pending Intake" }
        : null
    ));

    const summary = await importSquarespaceOrders([
      filmOrder({ id: "padded-existing", orderNumber: "01034" }),
      filmOrder({ id: "plain-existing", orderNumber: "1037" }),
      filmOrder({ id: "draft-zero-variant", orderNumber: "1035" }),
      filmOrder({ id: "fresh", orderNumber: "1036" }),
    ], deps);

    expect(summary.skippedDuplicate).toBe(3);
    expect(summary.imported).toBe(1);
    expect(summary.importedOrderNumbers).toEqual(["1036"]);
    expect(summary.errors).toEqual([]);
    expect(deps.orderNumberExists).toHaveBeenCalledWith("01034");
    expect(deps.orderNumberExists).toHaveBeenCalledWith("1037");
    expect(deps.createIncomingDraft).toHaveBeenCalledTimes(1);
    expect(deps.createIncomingDraft.mock.calls[0][0].squarespace_order_number).toBe("1036");
  });
});

describe("POST /api/incoming-drafts/check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    process.env[SQUARESPACE_API_KEY_ENV] = "test-squarespace-key";
    mockRequireAuth.mockResolvedValue({ id: "user-1" });
    mockOrderNumberExists.mockResolvedValue(false);
    mockGetIncomingDraftByOrderNumber.mockResolvedValue(null);
    mockGetIncomingDraftByExternalId.mockResolvedValue(null);
    mockCreateIncomingDraft.mockImplementation(async (data: unknown) => ({ id: "draft-1", status: "Pending Intake", ...data as object }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env[SQUARESPACE_API_KEY_ENV];
  });

  it("requires a staff session and does not call Squarespace", async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    const res = await POST();
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    expect(mockCreateIncomingDraft).not.toHaveBeenCalled();
  });

  it("explains a missing API key instead of failing", async () => {
    delete process.env[SQUARESPACE_API_KEY_ENV];
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(body.message).toMatch(/SQUARESPACE_API_KEY/);
    expect(body.message).toMatch(/Orders read/i);
    expect(fetch).not.toHaveBeenCalled();
    expect(mockCreateIncomingDraft).not.toHaveBeenCalled();
    expect(mockCreateOrder).not.toHaveBeenCalled();
    expect(mockSendOrderEmail).not.toHaveBeenCalled();
  });

  it("pages with the documented headers and imports only new film orders", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        pagination: { hasNextPage: true, nextPageCursor: "page-2" },
        result: [
          filmOrder({ fulfillmentStatus: "PENDING" }),
          filmOrder({ id: "pos-counter", orderNumber: "01080", channel: "pos", channelName: "Point of Sale" }),
          filmOrder({ id: "camera", orderNumber: "200", lineItems: [{ productName: "Point and Shoot Camera", quantity: 1 }] }),
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        pagination: { hasNextPage: false, nextPageCursor: null },
        result: [filmOrder({ id: "bw-120", orderNumber: "01070", fulfillmentStatus: "FULFILLED", lineItems: [{
          productName: "Black & White - 120 Development",
          quantity: 1,
          variantOptions: [
            { optionName: "Processing", value: "Dev + Standard Scan" },
            { optionName: "4x6 Prints", value: "No" },
          ],
        }] })],
      }), { status: 200 }));

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.imported).toBe(2);
    expect(body.skippedNoFilm).toBe(1);
    expect(body.skippedPos).toBe(1);
    expect(body.skippedDuplicate).toBe(0);
    expect(body.importedOrderNumbers).toEqual(["01050", "01070"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = fetchMock.mock.calls[0];
    const firstUrl = new URL(String(first[0]));
    expect(firstUrl.searchParams.has("fulfillmentStatus")).toBe(false);
    expect(firstUrl.searchParams.get("modifiedAfter")).toBeTruthy();
    const firstInit = first[1] as RequestInit;
    const firstHeaders = new Headers(firstInit.headers);
    expect(firstHeaders.get("Authorization")).toBe("Bearer test-squarespace-key");
    expect(firstHeaders.get("User-Agent")).toBe(SQUARESPACE_USER_AGENT);

    const secondUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(secondUrl.searchParams.get("cursor")).toBe("page-2");
    expect(secondUrl.searchParams.has("modifiedAfter")).toBe(false);
    expect(secondUrl.searchParams.has("fulfillmentStatus")).toBe(false);

    expect(mockCreateIncomingDraft).toHaveBeenCalledTimes(2);
    expect(mockCreateOrder).not.toHaveBeenCalled();
    expect(mockSendOrderEmail).not.toHaveBeenCalled();
    const created = mockCreateIncomingDraft.mock.calls.map((call) => call[0].squarespace_order_number);
    expect(created).toEqual(["01050", "01070"]);
    expect(mockOrderNumberExists).toHaveBeenCalledWith("01050");
  });
});

describe("fetchRecentSquarespaceOrders", () => {
  it("keeps orders already fetched when a later page fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        pagination: { hasNextPage: true, nextPageCursor: "page-2" },
        result: [filmOrder()],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("nope", { status: 500 }));

    const result = await fetchRecentSquarespaceOrders(fetchMock, "key", new Date("2026-10-04T00:00:00.000Z"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.orders).toHaveLength(1);
    expect(result.error).toMatch(/500/);
  });
});
