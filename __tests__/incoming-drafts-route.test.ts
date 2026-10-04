import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequireAuth = vi.fn();
const mockOrderNumberExists = vi.fn();
const mockGetIncomingDraftByOrderNumber = vi.fn();
const mockGetIncomingDraftByExternalId = vi.fn();
const mockCreateIncomingDraft = vi.fn();
const mockGetCustomerByEmailOrName = vi.fn();
const mockCreateCustomer = vi.fn();
const mockUpdateCustomer = vi.fn();
const mockGetPendingIncomingDrafts = vi.fn();
const mockGetIncomingDraftById = vi.fn();
const mockUpdateIncomingDraftStatus = vi.fn();
const mockDeleteIncomingDraft = vi.fn();
const mockGetOrderByNumber = vi.fn();
const mockCreateOrder = vi.fn();
const mockGetCustomers = vi.fn();
const mockSendOrderEmail = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock("@/lib/db", () => ({
  orderNumberExists: (...args: unknown[]) => mockOrderNumberExists(...args),
  getIncomingDraftByOrderNumber: (...args: unknown[]) => mockGetIncomingDraftByOrderNumber(...args),
  getIncomingDraftByExternalId: (...args: unknown[]) => mockGetIncomingDraftByExternalId(...args),
  createIncomingDraft: (...args: unknown[]) => mockCreateIncomingDraft(...args),
  getCustomerByEmailOrName: (...args: unknown[]) => mockGetCustomerByEmailOrName(...args),
  createCustomer: (...args: unknown[]) => mockCreateCustomer(...args),
  updateCustomer: (...args: unknown[]) => mockUpdateCustomer(...args),
  getPendingIncomingDrafts: (...args: unknown[]) => mockGetPendingIncomingDrafts(...args),
  getIncomingDraftById: (...args: unknown[]) => mockGetIncomingDraftById(...args),
  updateIncomingDraftStatus: (...args: unknown[]) => mockUpdateIncomingDraftStatus(...args),
  deleteIncomingDraft: (...args: unknown[]) => mockDeleteIncomingDraft(...args),
  getOrderByNumber: (...args: unknown[]) => mockGetOrderByNumber(...args),
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
  getCustomers: (...args: unknown[]) => mockGetCustomers(...args),
  createCustomer: (...args: unknown[]) => mockCreateCustomer(...args),
}));

vi.mock("@/lib/email-service", () => ({
  sendOrderEmail: (...args: unknown[]) => mockSendOrderEmail(...args),
}));

import { GET, POST } from "@/app/api/incoming-drafts/route";
import { DELETE as deleteDraft, PATCH } from "@/app/api/incoming-drafts/[id]/route";
import { POST as receiveDraft } from "@/app/api/incoming-drafts/[id]/receive/route";
import { SQUARESPACE_INTAKE_SECRET_ENV } from "@/lib/intake-auth";

const SECRET = "test-intake-secret";
const DRAFT_ID = "4f1c2d30-7b1a-4e2e-9c1a-6b0e1d2a3c4b";

const payload = {
  squarespace_order_number: "01050",
  external_order_id: "squarespace-01050",
  import_source: "squarespace",
  customer_name: "Justin Eisner",
  customer_email: "contact@justineisner.com",
  dropoff_date: "2026-10-03",
  roll_count: 1,
  roll_details: [{
    film_type: "35mm",
    film_process: "C41",
    scan_size: "High-Res",
    prints_4x6: true,
    film_stock: "Kodak Portra 800",
  }],
  notes: "bag 4",
  status: "Received by Yours",
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
    mockGetOrderByNumber.mockResolvedValue(null);
    mockCreateOrder.mockImplementation(async (data: Record<string, unknown>) => ({
      id: "order-1",
      ...data,
    }));
    mockGetIncomingDraftByOrderNumber.mockResolvedValue(null);
    mockGetIncomingDraftByExternalId.mockResolvedValue(null);
    mockCreateIncomingDraft.mockImplementation(async (data: Record<string, unknown>) => ({
      id: DRAFT_ID,
      status: "Pending Intake",
      ...data,
    }));
    mockGetCustomerByEmailOrName.mockResolvedValue({
      id: "cust-1",
      first_name: "Justin",
      last_name: "Eisner",
      total_rolls: 0,
      total_dropoffs: 0,
    });
    mockCreateCustomer.mockResolvedValue({
      id: "cust-new",
      first_name: "Justin",
      last_name: "Eisner",
      total_rolls: 0,
      total_dropoffs: 0,
    });
    mockUpdateCustomer.mockResolvedValue({});
    mockSendOrderEmail.mockResolvedValue({ success: true, variant: "film_drop_received", emailId: "em_1" });
    mockGetPendingIncomingDrafts.mockResolvedValue([]);
    mockGetIncomingDraftById.mockResolvedValue({
      id: DRAFT_ID,
      status: "Pending Intake",
      squarespace_order_number: "01050",
      external_order_id: "squarespace-01050",
      import_source: "squarespace",
      customer_name: "Justin Eisner",
      customer_email: "contact@justineisner.com",
      dropoff_date: "2026-10-03",
      roll_count: 1,
      roll_details: [{
        film_type: "35mm",
        film_process: "Color",
        scan_size: "High-Res",
        prints_4x6: true,
        film_stock: "Kodak Portra 800",
      }],
      notes: null,
    });
    mockUpdateIncomingDraftStatus.mockImplementation(async (id: string, status: string) => ({
      id,
      status,
      squarespace_order_number: "01050",
    }));
    mockDeleteIncomingDraft.mockResolvedValue(undefined);
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

    it("creates Pending Intake and does not receive the film or send email", async () => {
      const res = await postDraft(payload);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe("Pending Intake");
      expect(body.squarespace_order_number).toBe("01050");
      expect(body.customer_email).toBe("contact@justineisner.com");
      expect(body.import_source).toBe("squarespace");
      expect(body.roll_details[0].film_process).toBe("Color");
      expect(body).not.toHaveProperty("received_by_yours_at");
      expect(body).not.toHaveProperty("status_history");

      expect(mockCreateIncomingDraft).toHaveBeenCalledTimes(1);
      const inserted = mockCreateIncomingDraft.mock.calls[0][0];
      expect(inserted.squarespace_order_number).toBe("01050");
      expect(inserted.external_order_id).toBe("squarespace-01050");
      expect(inserted.import_source).toBe("squarespace");
      expect(inserted.roll_details[0].film_process).toBe("Color");
      expect(inserted.roll_details[0].scan_size).toBe("High-Res");
      expect(inserted.roll_details[0].prints_4x6).toBe(true);
      expect(inserted.roll_details[0].film_stock).toBe("Kodak Portra 800");
      expect(inserted).not.toHaveProperty("status");
      expect(inserted).not.toHaveProperty("received_by_yours_at");
      expect(inserted).not.toHaveProperty("status_history");
      expect(inserted).not.toHaveProperty("send_email");

      expect(mockCreateOrder).not.toHaveBeenCalled();
      expect(mockGetOrderByNumber).not.toHaveBeenCalled();
      expect(mockGetCustomers).not.toHaveBeenCalled();
      expect(mockCreateCustomer).not.toHaveBeenCalled();
      expect(mockGetCustomerByEmailOrName).not.toHaveBeenCalled();
      expect(mockSendOrderEmail).not.toHaveBeenCalled();
      expect(mockRequireAuth).not.toHaveBeenCalled();
    });

    it("rejects a duplicate external Squarespace order id", async () => {
      mockGetIncomingDraftByExternalId.mockResolvedValue({ id: DRAFT_ID, status: "Pending Intake" });
      const res = await postDraft({ ...payload, squarespace_order_number: "01051" });
      expect(res.status).toBe(409);
      expect(mockCreateIncomingDraft).not.toHaveBeenCalled();
      expect(mockCreateOrder).not.toHaveBeenCalled();
      expect(mockSendOrderEmail).not.toHaveBeenCalled();
    });

    it("rejects an order number that already exists as a real order", async () => {
      mockOrderNumberExists.mockResolvedValue(true);
      const res = await postDraft(payload);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toMatch(/already exists/);
      expect(mockOrderNumberExists).toHaveBeenCalledWith("01050");
      expect(mockCreateIncomingDraft).not.toHaveBeenCalled();
      expect(mockCreateOrder).not.toHaveBeenCalled();
    });

    it("rejects a duplicate Squarespace order number already stored as a draft", async () => {
      mockGetIncomingDraftByOrderNumber.mockResolvedValue({ id: DRAFT_ID, status: "dismissed" });
      const res = await postDraft(payload);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toMatch(/already imported/);
      expect(mockGetIncomingDraftByOrderNumber).toHaveBeenCalledWith("01050");
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
      mockGetPendingIncomingDrafts.mockResolvedValue([{ id: DRAFT_ID, status: "Pending Intake" }]);
      const res = await GET(new Request("http://localhost/api/incoming-drafts"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([{ id: DRAFT_ID, status: "Pending Intake" }]);
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

    it("hard-deletes a pending draft instead of marking it dismissed", async () => {
      const res = await patchDraft("dismissed");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, deleted: true });
      expect(mockDeleteIncomingDraft).toHaveBeenCalledWith(DRAFT_ID);
      expect(mockUpdateIncomingDraftStatus).not.toHaveBeenCalled();
      expect(mockCreateOrder).not.toHaveBeenCalled();
      expect(mockSendOrderEmail).not.toHaveBeenCalled();
    });

    it("hard-deletes an accepted draft so the order number can be imported again", async () => {
      mockGetIncomingDraftById.mockResolvedValue({
        id: DRAFT_ID,
        status: "accepted",
        squarespace_order_number: "01050",
        external_order_id: "squarespace-01050",
      });
      const res = await patchDraft("dismissed");
      expect(res.status).toBe(200);
      expect(mockDeleteIncomingDraft).toHaveBeenCalledWith(DRAFT_ID);
      expect(mockUpdateIncomingDraftStatus).not.toHaveBeenCalled();
    });

    it("returns the current draft when accepted is repeated", async () => {
      const current = { id: DRAFT_ID, status: "accepted", squarespace_order_number: "01050" };
      mockGetIncomingDraftById.mockResolvedValue(current);
      const res = await patchDraft("accepted");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(current);
      expect(mockUpdateIncomingDraftStatus).not.toHaveBeenCalled();
      expect(mockDeleteIncomingDraft).not.toHaveBeenCalled();
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

  describe("POST /api/incoming-drafts/:id/receive", () => {
    function receive(body: unknown, token: string | null = null) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.authorization = `Bearer ${token}`;
      return receiveDraft(new Request(`http://localhost/api/incoming-drafts/${DRAFT_ID}/receive`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }), { params: Promise.resolve({ id: DRAFT_ID }) });
    }

    it("does not accept the intake secret in place of a staff session", async () => {
      mockRequireAuth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
      const res = await receive({ send_email: true }, SECRET);
      expect(res.status).toBe(401);
      expect(mockCreateOrder).not.toHaveBeenCalled();
      expect(mockSendOrderEmail).not.toHaveBeenCalled();
    });

    it("sets Received by Yours, the received timestamp, status history, and sends the confirmation email", async () => {
      const res = await receive({ send_email: true });
      expect(res.status).toBe(201);
      expect(mockCreateOrder).toHaveBeenCalledTimes(1);
      const order = mockCreateOrder.mock.calls[0][0];
      expect(order.status).toBe("Received by Yours");
      expect(order.order_number).toBe("01050");
      expect(order.customer_name).toBe("Justin Eisner");
      expect(order.customer_email).toBe("contact@justineisner.com");
      expect(order.film_type).toBe("35mm");
      expect(order.film_process).toBe("Color");
      expect(order.roll_count).toBe(1);
      expect(order.roll_details[0].scan_size).toBe("High-Res");
      expect(order.roll_details[0].prints_4x6).toBe(true);
      expect(order.roll_details[0].film_stock).toBe("Kodak Portra 800");
      expect(typeof order.received_by_yours_at).toBe("string");
      expect(order.status_history).toEqual([
        { status: "Received by Yours", changed_at: order.received_by_yours_at },
      ]);
      expect(mockSendOrderEmail).toHaveBeenCalledWith("order-1", "film_drop_received");
      expect(mockUpdateIncomingDraftStatus).toHaveBeenCalledWith(DRAFT_ID, "accepted", "order-1");
      expect(mockDeleteIncomingDraft).not.toHaveBeenCalled();
    });

    it("skips the confirmation email when the checkbox is off", async () => {
      const res = await receive({ send_email: false });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.email.skipped).toBe(true);
      expect(body.order.status).toBe("Received by Yours");
      expect(mockSendOrderEmail).not.toHaveBeenCalled();
      expect(mockUpdateIncomingDraftStatus).toHaveBeenCalledWith(DRAFT_ID, "accepted", "order-1");
    });
  });

  describe("DELETE /api/incoming-drafts/:id", () => {
    function removeDraft(token: string | null = null, id = DRAFT_ID) {
      const headers: Record<string, string> = {};
      if (token) headers.authorization = `Bearer ${token}`;
      return deleteDraft(new Request(`http://localhost/api/incoming-drafts/${id}`, {
        method: "DELETE",
        headers,
      }), { params: Promise.resolve({ id }) });
    }

    it("does not accept the intake secret in place of a staff session", async () => {
      mockRequireAuth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
      const res = await removeDraft(SECRET);
      expect(res.status).toBe(401);
      expect(mockDeleteIncomingDraft).not.toHaveBeenCalled();
      expect(mockCreateOrder).not.toHaveBeenCalled();
    });

    it("hard-deletes a Pending Intake row and does not create an order", async () => {
      const res = await removeDraft();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, deleted: true });
      expect(mockDeleteIncomingDraft).toHaveBeenCalledWith(DRAFT_ID);
      expect(mockUpdateIncomingDraftStatus).not.toHaveBeenCalled();
      expect(mockCreateOrder).not.toHaveBeenCalled();
      expect(mockSendOrderEmail).not.toHaveBeenCalled();
    });

    it("returns 404 for an unknown id", async () => {
      const res = await removeDraft(null, "nope");
      expect(res.status).toBe(404);
      expect(mockDeleteIncomingDraft).not.toHaveBeenCalled();
    });
  });
});
