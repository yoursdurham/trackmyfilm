import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequireAuth = vi.fn();
const mockOrderNumberExists = vi.fn();
const mockGetIncomingDraftByOrderNumber = vi.fn();
const mockCreateIncomingDraft = vi.fn();
const mockGetPendingIncomingDrafts = vi.fn();
const mockGetIncomingDraftById = vi.fn();
const mockUpdateIncomingDraftStatus = vi.fn();
const mockGetOrderByNumber = vi.fn();
const mockCreateOrder = vi.fn();
const mockGetCustomers = vi.fn();
const mockCreateCustomer = vi.fn();
const mockSendOrderEmail = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock("@/lib/db", () => ({
  orderNumberExists: (...args: unknown[]) => mockOrderNumberExists(...args),
  getIncomingDraftByOrderNumber: (...args: unknown[]) => mockGetIncomingDraftByOrderNumber(...args),
  createIncomingDraft: (...args: unknown[]) => mockCreateIncomingDraft(...args),
  getPendingIncomingDrafts: (...args: unknown[]) => mockGetPendingIncomingDrafts(...args),
  getIncomingDraftById: (...args: unknown[]) => mockGetIncomingDraftById(...args),
  updateIncomingDraftStatus: (...args: unknown[]) => mockUpdateIncomingDraftStatus(...args),
  getOrderByNumber: (...args: unknown[]) => mockGetOrderByNumber(...args),
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
  getCustomers: (...args: unknown[]) => mockGetCustomers(...args),
  createCustomer: (...args: unknown[]) => mockCreateCustomer(...args),
}));

vi.mock("@/lib/email-service", () => ({
  sendOrderEmail: (...args: unknown[]) => mockSendOrderEmail(...args),
}));

import { GET, POST } from "@/app/api/incoming-drafts/route";
import { PATCH } from "@/app/api/incoming-drafts/[id]/route";
import { SQUARESPACE_INTAKE_SECRET_ENV } from "@/lib/intake-auth";

const SECRET = "test-intake-secret";
const DRAFT_ID = "4f1c2d30-7b1a-4e2e-9c1a-6b0e1d2a3c4b";

const payload = {
  squarespace_order_number: "sq-1001",
  customer_name: "Jane Doe",
  customer_email: "jane@example.com",
  dropoff_date: "2026-10-03",
  roll_count: 1,
  roll_details: [{
    film_type: "35mm",
    film_process: "Color",
    scan_size: "Standard",
    prints_4x6: false,
    film_stock: "Kodak Gold 200",
  }],
  notes: "bag 4",
  status: "accepted",
  send_email: true,
};

function postDraft(body: unknown, token: string | null = SECRET) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return POST(new Request("http://localhost/api/incoming-drafts", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }));
}

describe("Squarespace incoming draft routes", () => {
  const originalSecret = process.env[SQUARESPACE_INTAKE_SECRET_ENV];

  beforeEach(() => {
    vi.clearAllMocks();
    process.env[SQUARESPACE_INTAKE_SECRET_ENV] = SECRET;
    mockRequireAuth.mockResolvedValue({ id: "user-1", email: "staff@example.com" });
    mockOrderNumberExists.mockResolvedValue(false);
    mockGetIncomingDraftByOrderNumber.mockResolvedValue(null);
    mockCreateIncomingDraft.mockImplementation(async (data: Record<string, unknown>) => ({
      id: DRAFT_ID,
      status: "pending",
      ...data,
    }));
    mockGetPendingIncomingDrafts.mockResolvedValue([]);
    mockGetIncomingDraftById.mockResolvedValue({
      id: DRAFT_ID,
      status: "pending",
      squarespace_order_number: "SQ-1001",
    });
    mockUpdateIncomingDraftStatus.mockImplementation(async (id: string, status: string) => ({
      id,
      status,
      squarespace_order_number: "SQ-1001",
    }));
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env[SQUARESPACE_INTAKE_SECRET_ENV];
    else process.env[SQUARESPACE_INTAKE_SECRET_ENV] = originalSecret;
  });

  describe("POST /api/incoming-drafts", () => {
    it("rejects missing, wrong, and unconfigured secrets without using the staff session", async () => {
      mockRequireAuth.mockImplementation(() => {
        throw new Error("session auth must not create drafts");
      });

      expect((await postDraft(payload, null)).status).toBe(401);
      expect((await postDraft(payload, "wrong-secret")).status).toBe(401);

      delete process.env[SQUARESPACE_INTAKE_SECRET_ENV];
      expect((await postDraft(payload, SECRET)).status).toBe(401);

      expect(mockCreateIncomingDraft).not.toHaveBeenCalled();
      expect(mockRequireAuth).not.toHaveBeenCalled();
    });

    it("creates a pending draft and does not create orders, read customers, or send email", async () => {
      const res = await postDraft(payload);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe("pending");
      expect(body.squarespace_order_number).toBe("SQ-1001");
      expect(body.customer_email).toBe("jane@example.com");

      expect(mockCreateIncomingDraft).toHaveBeenCalledTimes(1);
      const inserted = mockCreateIncomingDraft.mock.calls[0][0];
      expect(inserted.status).toBeUndefined();
      expect(inserted).not.toHaveProperty("send_email");

      expect(mockCreateOrder).not.toHaveBeenCalled();
      expect(mockGetOrderByNumber).not.toHaveBeenCalled();
      expect(mockGetCustomers).not.toHaveBeenCalled();
      expect(mockCreateCustomer).not.toHaveBeenCalled();
      expect(mockSendOrderEmail).not.toHaveBeenCalled();
      expect(mockRequireAuth).not.toHaveBeenCalled();
    });

    it("rejects an order number that already exists as a real order", async () => {
      mockOrderNumberExists.mockResolvedValue(true);
      const res = await postDraft(payload);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toMatch(/already exists/);
      expect(mockCreateIncomingDraft).not.toHaveBeenCalled();
      expect(mockCreateOrder).not.toHaveBeenCalled();
    });

    it("rejects a duplicate Squarespace order number already stored as a draft", async () => {
      mockGetIncomingDraftByOrderNumber.mockResolvedValue({ id: DRAFT_ID, status: "dismissed" });
      const res = await postDraft(payload);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toMatch(/already imported/);
      expect(mockCreateIncomingDraft).not.toHaveBeenCalled();
    });

    it("returns 409 when the database unique constraint rejects a race", async () => {
      const err = new Error('duplicate key value violates unique constraint "incoming_squarespace_drafts_order_number_idx"') as Error & { code?: string };
      err.code = "23505";
      mockCreateIncomingDraft.mockRejectedValue(err);
      const res = await postDraft(payload);
      expect(res.status).toBe(409);
    });

    it("returns 400 for invalid JSON and invalid roll details", async () => {
      const invalidJson = await POST(new Request("http://localhost/api/incoming-drafts", {
        method: "POST",
        headers: {
          authorization: `Bearer ${SECRET}`,
          "content-type": "application/json",
        },
        body: "{",
      }));
      expect(invalidJson.status).toBe(400);

      const invalidRoll = await postDraft({
        ...payload,
        roll_details: [{ film_type: "35mm", film_process: "Sepia" }],
      });
      expect(invalidRoll.status).toBe(400);
      expect(mockCreateIncomingDraft).not.toHaveBeenCalled();
      expect(mockSendOrderEmail).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/incoming-drafts", () => {
    it("requires a logged-in session even when the intake secret is presented", async () => {
      mockRequireAuth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
      const res = await GET(new Request("http://localhost/api/incoming-drafts", {
        headers: { authorization: `Bearer ${SECRET}` },
      }));
      expect(res.status).toBe(401);
      expect(mockGetPendingIncomingDrafts).not.toHaveBeenCalled();
    });

    it("returns pending drafts for staff", async () => {
      mockGetPendingIncomingDrafts.mockResolvedValue([{ id: DRAFT_ID, status: "pending" }]);
      const res = await GET(new Request("http://localhost/api/incoming-drafts"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([{ id: DRAFT_ID, status: "pending" }]);
    });
  });

  describe("PATCH /api/incoming-drafts/:id", () => {
    function patchDraft(status: unknown, token: string | null = null) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.authorization = `Bearer ${token}`;
      return PATCH(new Request(`http://localhost/api/incoming-drafts/${DRAFT_ID}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status }),
      }), { params: Promise.resolve({ id: DRAFT_ID }) });
    }

    it("does not accept the intake secret in place of a staff session", async () => {
      mockRequireAuth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
      const res = await patchDraft("accepted", SECRET);
      expect(res.status).toBe(401);
      expect(mockUpdateIncomingDraftStatus).not.toHaveBeenCalled();
      expect(mockCreateOrder).not.toHaveBeenCalled();
      expect(mockSendOrderEmail).not.toHaveBeenCalled();
    });

    it("marks a pending draft accepted without creating an order", async () => {
      const res = await patchDraft("accepted");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("accepted");
      expect(mockUpdateIncomingDraftStatus).toHaveBeenCalledWith(DRAFT_ID, "accepted");
      expect(mockCreateOrder).not.toHaveBeenCalled();
      expect(mockSendOrderEmail).not.toHaveBeenCalled();
      expect(mockGetCustomers).not.toHaveBeenCalled();
    });

    it("marks a pending draft dismissed", async () => {
      const res = await patchDraft("dismissed");
      expect(res.status).toBe(200);
      expect(mockUpdateIncomingDraftStatus).toHaveBeenCalledWith(DRAFT_ID, "dismissed");
    });

    it("rejects crossing from accepted to dismissed", async () => {
      mockGetIncomingDraftById.mockResolvedValue({ id: DRAFT_ID, status: "accepted" });
      const res = await patchDraft("dismissed");
      expect(res.status).toBe(409);
      expect(mockUpdateIncomingDraftStatus).not.toHaveBeenCalled();
    });

    it("returns the current draft when the same terminal status is repeated", async () => {
      const current = { id: DRAFT_ID, status: "dismissed", squarespace_order_number: "SQ-1001" };
      mockGetIncomingDraftById.mockResolvedValue(current);
      const res = await patchDraft("dismissed");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(current);
      expect(mockUpdateIncomingDraftStatus).not.toHaveBeenCalled();
    });

    it("returns 404 for an unknown id and does not touch orders", async () => {
      const res = await PATCH(new Request("http://localhost/api/incoming-drafts/nope", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      }), { params: Promise.resolve({ id: "nope" }) });
      expect(res.status).toBe(404);
      expect(mockGetIncomingDraftById).not.toHaveBeenCalled();
      expect(mockCreateOrder).not.toHaveBeenCalled();
    });
  });
});
