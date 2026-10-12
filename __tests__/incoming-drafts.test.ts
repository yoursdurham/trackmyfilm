import { describe, it, expect } from "vitest";
import {
  buildIncomingDraftInsert,
  DISMISSED_STATUS_NOT_READY,
  incomingDraftDeleteMatch,
  isDismissedStatusCheckViolation,
  isDismissedStatusNotReady,
  isIncomingDraftUuid,
  parseIncomingDraftPayload,
  resolveIncomingDraftStatusChange,
  squarespaceDraftBlocksImport,
} from "../lib/incoming-drafts";

const validRoll = {
  film_type: "35mm",
  film_process: "Color",
  scan_size: "High-Res",
  prints_4x6: true,
  film_stock: "Kodak Portra 400",
};

const validBody = {
  squarespace_order_number: "sq-1001",
  external_order_id: "sq-id-1001",
  customer_name: "  Jane Doe  ",
  customer_email: "Jane@Example.com",
  dropoff_date: "2026-10-03",
  roll_count: 1,
  roll_details: [validRoll],
  notes: "  hold at counter  ",
  import_source: "squarespace",
  status: "Received by Yours",
};

describe("parseIncomingDraftPayload", () => {
  it("normalizes a valid Squarespace draft and ignores a requested status", () => {
    const result = parseIncomingDraftPayload(validBody);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      squarespace_order_number: "SQ-1001",
      external_order_id: "sq-id-1001",
      customer_name: "Jane Doe",
      customer_email: "jane@example.com",
      dropoff_date: "2026-10-03",
      roll_count: 1,
      roll_details: [{
        film_type: "35mm",
        film_process: "Color",
        scan_size: "High-Res",
        prints_4x6: true,
        film_stock: "Kodak Portra 400",
      }],
      notes: "hold at counter",
      import_source: "squarespace",
    });
    expect(result.value).not.toHaveProperty("status");
    expect(result.value).not.toHaveProperty("received_by_yours_at");
    expect(result.value).not.toHaveProperty("status_history");
  });

  it("maps Squarespace C41 to Color and keeps order 01050 for Justin Eisner", () => {
    const result = parseIncomingDraftPayload({
      squarespace_order_number: "01050",
      external_order_id: "squarespace-01050",
      import_source: "squarespace",
      customer_name: "Justin Eisner",
      customer_email: "contact@justineisner.com",
      roll_count: 1,
      roll_details: [{
        film_type: "35mm",
        film_process: "C41",
        scan_size: "High-Res",
        prints_4x6: true,
        film_stock: "Kodak Portra 800",
      }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.squarespace_order_number).toBe("01050");
    expect(result.value.external_order_id).toBe("squarespace-01050");
    expect(result.value.import_source).toBe("squarespace");
    expect(result.value.customer_name).toBe("Justin Eisner");
    expect(result.value.customer_email).toBe("contact@justineisner.com");
    expect(result.value.roll_count).toBe(1);
    expect(result.value.roll_details[0]).toEqual({
      film_type: "35mm",
      film_process: "Color",
      scan_size: "High-Res",
      prints_4x6: true,
      film_stock: "Kodak Portra 800",
    });

    const row = buildIncomingDraftInsert(result.value);
    expect(row.status).toBe("Pending Intake");
    expect(row).not.toHaveProperty("received_by_yours_at");
    expect(row).not.toHaveProperty("status_history");
    expect(row.import_source).toBe("squarespace");
  });

  it("accepts 120 and 110 film, black and white, and every scan size", () => {
    const result = parseIncomingDraftPayload({
      ...validBody,
      roll_count: 4,
      roll_details: [
        { film_type: "120", film_process: "Black & White", scan_size: "Standard" },
        { film_type: 110, film_process: "Color", scan_size: "TIFF" },
        { film_type: "35mm", film_process: "Black & White", scan_size: "Process Only", prints_4x6: false },
        { film_type: "110", film_process: "Color" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.roll_details.map((roll) => roll.film_type)).toEqual(["120", "110", "35mm", "110"]);
    expect(result.value.roll_details[1].film_type).toBe("110");
    expect(typeof result.value.roll_details[1].film_type).toBe("string");
    expect(result.value.roll_details[3].scan_size).toBe("Standard");
    expect(result.value.roll_details[3].prints_4x6).toBe(false);
  });

  it("coerces a numeric Squarespace order number and defaults import_source", () => {
    const result = parseIncomingDraftPayload({
      squarespace_order_number: 48291,
      external_order_id: validBody.external_order_id,
      customer_name: validBody.customer_name,
      customer_email: "",
      dropoff_date: null,
      roll_count: validBody.roll_count,
      roll_details: validBody.roll_details,
      notes: "   ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.squarespace_order_number).toBe("48291");
    expect(result.value.import_source).toBe("squarespace");

    const aliased = parseIncomingDraftPayload({ ...validBody, import_source: undefined, source: "squarespace" });
    expect(aliased.ok).toBe(true);
    if (!aliased.ok) return;
    expect(aliased.value.import_source).toBe("squarespace");
    expect(result.value.customer_email).toBeNull();
    expect(result.value.dropoff_date).toBeNull();
    expect(result.value.notes).toBeNull();
  });

  it("rejects non-objects, missing fields, and bad emails", () => {
    expect(parseIncomingDraftPayload(null).ok).toBe(false);
    expect(parseIncomingDraftPayload([]).ok).toBe(false);
    expect(parseIncomingDraftPayload({ ...validBody, squarespace_order_number: "  " }).ok).toBe(false);
    expect(parseIncomingDraftPayload({ ...validBody, customer_name: " " }).ok).toBe(false);
    expect(parseIncomingDraftPayload({ ...validBody, customer_email: "not-an-email" }).ok).toBe(false);
  });

  it("rejects roll counts that do not match the per-roll details", () => {
    const mismatch = parseIncomingDraftPayload({ ...validBody, roll_count: 2 });
    expect(mismatch.ok).toBe(false);
    if (mismatch.ok) return;
    expect(mismatch.error).toMatch(/roll_count/);

    const missing = parseIncomingDraftPayload({ ...validBody, roll_count: "1" });
    expect(missing.ok).toBe(false);
  });

  it("rejects film types, processes, and scan sizes the drop-off form cannot save", () => {
    expect(parseIncomingDraftPayload({
      ...validBody,
      roll_details: [{ ...validRoll, film_type: "Disposable Camera" }],
    }).ok).toBe(false);
    expect(parseIncomingDraftPayload({
      ...validBody,
      roll_details: [{ ...validRoll, film_process: "Both" }],
    }).ok).toBe(false);
    expect(parseIncomingDraftPayload({
      ...validBody,
      roll_details: [{ ...validRoll, scan_size: "Huge" }],
    }).ok).toBe(false);
    expect(parseIncomingDraftPayload({
      ...validBody,
      roll_details: [{ ...validRoll, prints_4x6: "yes" }],
    }).ok).toBe(false);
  });

  it("rejects more than 20 rolls, bad dates, and an invalid source", () => {
    const rolls = Array.from({ length: 21 }, () => validRoll);
    expect(parseIncomingDraftPayload({ ...validBody, roll_count: 21, roll_details: rolls }).ok).toBe(false);
    expect(parseIncomingDraftPayload({ ...validBody, dropoff_date: "10/03/2026" }).ok).toBe(false);
    expect(parseIncomingDraftPayload({ ...validBody, dropoff_date: "2026-02-31" }).ok).toBe(false);
    expect(parseIncomingDraftPayload({ ...validBody, import_source: "squarespace!" }).ok).toBe(false);
    expect(parseIncomingDraftPayload({ ...validBody, external_order_id: "  " }).ok).toBe(false);
  });
});

describe("resolveIncomingDraftStatusChange", () => {
  it("accepts a Pending Intake item and treats a repeated accept as a no-op", () => {
    expect(resolveIncomingDraftStatusChange("Pending Intake", "accepted")).toEqual({
      ok: true, status: "accepted", changed: true,
    });
    expect(resolveIncomingDraftStatusChange("accepted", "accepted")).toEqual({
      ok: true, status: "accepted", changed: false,
    });
  });

  it("stores dismiss on a Pending Intake row and treats a repeated dismiss as a no-op", () => {
    expect(resolveIncomingDraftStatusChange("Pending Intake", "dismissed")).toEqual({
      ok: true, status: "dismissed", changed: true,
    });
    expect(resolveIncomingDraftStatusChange("dismissed", "dismissed")).toEqual({
      ok: true, status: "dismissed", changed: false,
    });
  });

  it("rejects an unknown status and dismissing an accepted draft", () => {
    const invalid = resolveIncomingDraftStatusChange("Pending Intake", "Pending Intake");
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.reason).toBe("invalid");

    const accepted = resolveIncomingDraftStatusChange("accepted", "dismissed");
    expect(accepted.ok).toBe(false);
    if (accepted.ok) return;
    expect(accepted.reason).toBe("conflict");
  });

  it("rejects accepting a draft that is no longer Pending Intake", () => {
    const conflict = resolveIncomingDraftStatusChange("dismissed", "accepted");
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.reason).toBe("conflict");
  });
});

describe("squarespaceDraftBlocksImport", () => {
  const incoming = {
    squarespace_order_number: "1034",
    external_order_id: "sq-new",
  };

  it("blocks a dismissed order with the same Squarespace id or the same normalized number", () => {
    expect(squarespaceDraftBlocksImport({
      status: "dismissed",
      squarespace_order_number: "01034",
      external_order_id: "sq-old",
    }, incoming)).toBe(true);

    expect(squarespaceDraftBlocksImport({
      status: "dismissed",
      squarespace_order_number: "9999",
      external_order_id: "sq-new",
    }, {
      squarespace_order_number: "1040",
      external_order_id: " sq-new ",
    })).toBe(true);

    expect(squarespaceDraftBlocksImport({
      status: "dismissed",
      squarespace_order_number: "1034",
      external_order_id: "other",
    }, {
      squarespace_order_number: "01034",
      external_order_id: "fresh",
    })).toBe(true);
  });

  it("does not block a different order, and still blocks a lookup row that has no identity fields", () => {
    expect(squarespaceDraftBlocksImport({
      status: "dismissed",
      squarespace_order_number: "01035",
      external_order_id: "sq-other",
    }, incoming)).toBe(false);
    expect(squarespaceDraftBlocksImport(null, incoming)).toBe(false);
    expect(squarespaceDraftBlocksImport({ id: "draft-1", status: "dismissed" }, incoming)).toBe(true);
  });
});

describe("isDismissedStatusCheckViolation", () => {
  it("recognizes the status check from migration 016 and ignores other failures", () => {
    expect(isDismissedStatusCheckViolation({
      code: "23514",
      message: 'new row for relation "incoming_squarespace_drafts" violates check constraint "incoming_squarespace_drafts_status_check"',
    })).toBe(true);
    expect(isDismissedStatusCheckViolation({
      code: "23514",
      message: "new row violates check constraint on status",
    })).toBe(true);
    expect(isDismissedStatusCheckViolation({
      code: "23514",
      message: "roll_count check failed",
    })).toBe(false);
    expect(isDismissedStatusCheckViolation({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isDismissedStatusNotReady({ code: DISMISSED_STATUS_NOT_READY })).toBe(true);
    expect(isDismissedStatusNotReady(new Error("nope"))).toBe(false);
  });
});

describe("incomingDraftDeleteMatch", () => {
  it("matches the normalized order number and the Squarespace external id", () => {
    expect(incomingDraftDeleteMatch({
      order_number: " 01050 ",
      external_order_id: " squarespace-01050 ",
    })).toEqual({
      orderNumbers: ["01050"],
      externalOrderIds: ["squarespace-01050", "01050"],
    });
  });

  it("still matches an external id that is the film order number", () => {
    expect(incomingDraftDeleteMatch({ order_number: "sq-1001" })).toEqual({
      orderNumbers: ["SQ-1001"],
      externalOrderIds: ["sq-1001", "SQ-1001"],
    });
  });
});

describe("isIncomingDraftUuid", () => {
  it("accepts a uuid and rejects other ids", () => {
    expect(isIncomingDraftUuid("4f1c2d30-7b1a-4e2e-9c1a-6b0e1d2a3c4b")).toBe(true);
    expect(isIncomingDraftUuid("order-1")).toBe(false);
    expect(isIncomingDraftUuid("")).toBe(false);
  });
});
