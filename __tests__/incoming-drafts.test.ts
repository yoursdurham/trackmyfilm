import { describe, it, expect } from "vitest";
import {
  isIncomingDraftUuid,
  parseIncomingDraftPayload,
  resolveIncomingDraftStatusChange,
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
  customer_name: "  Jane Doe  ",
  customer_email: "Jane@Example.com",
  dropoff_date: "2026-10-03",
  roll_count: 1,
  roll_details: [validRoll],
  notes: "  hold at counter  ",
  source: "squarespace",
  status: "accepted",
};

describe("parseIncomingDraftPayload", () => {
  it("normalizes a valid Squarespace draft and ignores a requested status", () => {
    const result = parseIncomingDraftPayload(validBody);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      squarespace_order_number: "SQ-1001",
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
      source: "squarespace",
    });
    expect(result.value).not.toHaveProperty("status");
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

  it("coerces a numeric Squarespace order number and defaults source", () => {
    const result = parseIncomingDraftPayload({
      ...validBody,
      squarespace_order_number: 48291,
      source: undefined,
      customer_email: "",
      dropoff_date: null,
      notes: "   ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.squarespace_order_number).toBe("48291");
    expect(result.value.source).toBe("squarespace");
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
    expect(parseIncomingDraftPayload({ ...validBody, source: "squarespace!" }).ok).toBe(false);
  });
});

describe("resolveIncomingDraftStatusChange", () => {
  it("accepts or dismisses a pending draft", () => {
    expect(resolveIncomingDraftStatusChange("pending", "accepted")).toEqual({
      ok: true, status: "accepted", changed: true,
    });
    expect(resolveIncomingDraftStatusChange("pending", "dismissed")).toEqual({
      ok: true, status: "dismissed", changed: true,
    });
  });

  it("treats a repeated terminal status as a no-op", () => {
    expect(resolveIncomingDraftStatusChange("accepted", "accepted")).toEqual({
      ok: true, status: "accepted", changed: false,
    });
    expect(resolveIncomingDraftStatusChange("dismissed", "dismissed")).toEqual({
      ok: true, status: "dismissed", changed: false,
    });
  });

  it("rejects pending as a target and crossing between terminal statuses", () => {
    const invalid = resolveIncomingDraftStatusChange("pending", "pending");
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.reason).toBe("invalid");

    const conflict = resolveIncomingDraftStatusChange("accepted", "dismissed");
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.reason).toBe("conflict");
    expect(resolveIncomingDraftStatusChange("dismissed", "accepted").ok).toBe(false);
  });
});

describe("isIncomingDraftUuid", () => {
  it("accepts a uuid and rejects other ids", () => {
    expect(isIncomingDraftUuid("4f1c2d30-7b1a-4e2e-9c1a-6b0e1d2a3c4b")).toBe(true);
    expect(isIncomingDraftUuid("order-1")).toBe(false);
    expect(isIncomingDraftUuid("")).toBe(false);
  });
});
