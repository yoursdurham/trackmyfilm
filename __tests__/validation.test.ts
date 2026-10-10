import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isValidTransition,
  isKnownStatus,
  isWithinDedupWindow,
  normalizeCustomerName,
  normalizeEmail,
  normalizeOrderNumber,
  orderNumberMatchKey,
  orderNumberMatchPattern,
  orderNumberMatchesSearch,
  orderNumbersMatch,
  preferStoredOrderNumber,
  isValidUrl,
  ensureHttps,
  isValidEmail,
  normalizeFilmType,
  isValidFilmType,
  validateRollDetails,
  validateRollBlankFlags,
} from "../lib/validation";

// ─── Status transitions ───────────────────────────────────────────────────────

describe("isValidTransition", () => {
  it("allows forward: Received by Yours → Received at Lab", () => {
    expect(isValidTransition("Received by Yours", "Received at Lab")).toBe(true);
  });

  it("allows forward: Received at Lab → Scans Sent", () => {
    expect(isValidTransition("Received at Lab", "Scans Sent")).toBe(true);
  });

  it("allows forward: Received at Lab → Ready for Pickup", () => {
    expect(isValidTransition("Received at Lab", "Ready for Pickup")).toBe(true);
  });

  it("allows skipping a step forward: Received by Yours → Scans Sent", () => {
    expect(isValidTransition("Received by Yours", "Scans Sent")).toBe(true);
  });

  it("rejects backward: Received at Lab → Received by Yours", () => {
    expect(isValidTransition("Received at Lab", "Received by Yours")).toBe(false);
  });

  it("rejects backward: Scans Sent → Received at Lab", () => {
    expect(isValidTransition("Scans Sent", "Received at Lab")).toBe(false);
  });

  it("rejects backward: Scans Sent → Received by Yours", () => {
    expect(isValidTransition("Scans Sent", "Received by Yours")).toBe(false);
  });

  it("rejects same status: Received by Yours → Received by Yours", () => {
    expect(isValidTransition("Received by Yours", "Received by Yours")).toBe(false);
  });

  it("rejects same status: Received at Lab → Received at Lab", () => {
    expect(isValidTransition("Received at Lab", "Received at Lab")).toBe(false);
  });

  it("rejects same status: Scans Sent → Scans Sent", () => {
    expect(isValidTransition("Scans Sent", "Scans Sent")).toBe(false);
  });

  it("allows parking any pipeline status, and leaving On Hold for any pipeline status", () => {
    expect(isValidTransition("Received by Yours", "On Hold")).toBe(true);
    expect(isValidTransition("Received at Lab", "On Hold")).toBe(true);
    expect(isValidTransition("Ready for Pickup", "On Hold")).toBe(true);
    expect(isValidTransition("Scans Sent", "On Hold")).toBe(true);
    expect(isValidTransition("On Hold", "Received by Yours")).toBe(true);
    expect(isValidTransition("On Hold", "Received at Lab")).toBe(true);
    expect(isValidTransition("On Hold", "Ready for Pickup")).toBe(true);
    expect(isValidTransition("On Hold", "Scans Sent")).toBe(true);
    expect(isValidTransition("On Hold", "On Hold")).toBe(false);
  });
});

// ─── Known status guard ───────────────────────────────────────────────────────

describe("isKnownStatus", () => {
  it("accepts all valid statuses", () => {
    expect(isKnownStatus("Received by Yours")).toBe(true);
    expect(isKnownStatus("Received at Lab")).toBe(true);
    expect(isKnownStatus("Ready for Pickup")).toBe(true);
    expect(isKnownStatus("Scans Sent")).toBe(true);
    expect(isKnownStatus("On Hold")).toBe(true);
  });

  it("rejects unknown strings", () => {
    expect(isKnownStatus("")).toBe(false);
    expect(isKnownStatus("received by yours")).toBe(false);
    expect(isKnownStatus("Pending")).toBe(false);
    expect(isKnownStatus("In Transit")).toBe(false);
    expect(isKnownStatus("SCANS SENT")).toBe(false);
    expect(isKnownStatus("scans sent")).toBe(false);
  });
});

// ─── Email dedup window ───────────────────────────────────────────────────────

describe("isWithinDedupWindow", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("returns false for null", () => {
    expect(isWithinDedupWindow(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isWithinDedupWindow(undefined)).toBe(false);
  });

  it("returns true when sent just now", () => {
    expect(isWithinDedupWindow(new Date().toISOString())).toBe(true);
  });

  it("returns true when sent 30 minutes ago", () => {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    expect(isWithinDedupWindow(thirtyMinsAgo)).toBe(true);
  });

  it("returns true when sent 59 minutes ago", () => {
    const fiftyNineMinsAgo = new Date(Date.now() - 59 * 60 * 1000).toISOString();
    expect(isWithinDedupWindow(fiftyNineMinsAgo)).toBe(true);
  });

  it("returns false when sent exactly 1 hour + 1ms ago", () => {
    const justOver = new Date(Date.now() - (60 * 60 * 1000 + 1)).toISOString();
    expect(isWithinDedupWindow(justOver)).toBe(false);
  });

  it("returns false when sent 2 hours ago", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(isWithinDedupWindow(twoHoursAgo)).toBe(false);
  });

  it("returns false when sent yesterday", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinDedupWindow(yesterday)).toBe(false);
  });
});

// ─── Name / email / order number normalization ────────────────────────────────

describe("normalizeCustomerName", () => {
  it("lowercases the name", () => {
    expect(normalizeCustomerName("John Doe")).toBe("john doe");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeCustomerName("  Jane Smith  ")).toBe("jane smith");
  });

  it("collapses multiple internal spaces", () => {
    expect(normalizeCustomerName("John   Doe")).toBe("john doe");
  });

  it("handles single-word names", () => {
    expect(normalizeCustomerName("Justin")).toBe("justin");
  });

  it("handles empty string", () => {
    expect(normalizeCustomerName("")).toBe("");
  });

  it("collapses tabs to single space", () => {
    expect(normalizeCustomerName("John\tDoe")).toBe("john doe");
  });

  it("all caps name is lowercased", () => {
    expect(normalizeCustomerName("JOHN DOE")).toBe("john doe");
  });
});

describe("normalizeEmail", () => {
  it("lowercases the email", () => {
    expect(normalizeEmail("Hello@YoursDurham.COM")).toBe("hello@yoursdurham.com");
  });

  it("trims leading whitespace", () => {
    expect(normalizeEmail("  user@example.com")).toBe("user@example.com");
  });

  it("trims trailing whitespace", () => {
    expect(normalizeEmail("user@example.com  ")).toBe("user@example.com");
  });

  it("leaves already-normalized email unchanged", () => {
    expect(normalizeEmail("hello@yoursdurham.com")).toBe("hello@yoursdurham.com");
  });
});

describe("isValidEmail", () => {
  it("accepts a standard email", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  it("rejects missing @", () => {
    expect(isValidEmail("userexample.com")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("rejects whitespace only", () => {
    expect(isValidEmail("   ")).toBe(false);
  });
});

describe("normalizeFilmType", () => {
  it("accepts 110 as a string film type", () => {
    expect(normalizeFilmType("110")).toBe("110");
    expect(isValidFilmType("110")).toBe(true);
  });

  it("coerces numeric 110 to string", () => {
    expect(normalizeFilmType(110)).toBe("110");
  });

  it("rejects unknown formats", () => {
    expect(normalizeFilmType("70mm")).toBeNull();
  });
});

describe("validateRollDetails", () => {
  it("accepts two 110 rolls", () => {
    expect(
      validateRollDetails([
        { film_type: "110", film_process: "Color", scan_size: "Standard" },
        { film_type: "110", film_process: "Color", scan_size: "Standard" },
      ])
    ).toBeNull();
  });

  it("accepts a missing blank flag and a boolean blank flag", () => {
    expect(
      validateRollDetails([
        { film_type: "35mm", film_process: "Color" },
        { film_type: "35mm", film_process: "Color", blank: true },
        { film_type: "35mm", film_process: "Color", blank: false },
      ])
    ).toBeNull();
    expect(validateRollBlankFlags(undefined)).toBeNull();
    expect(validateRollBlankFlags(null)).toBeNull();
  });

  it("rejects a non-boolean blank flag", () => {
    expect(
      validateRollBlankFlags([
        { film_type: "35mm", film_process: "Color", blank: "yes" },
      ])
    ).toBe("roll_details[0].blank must be a boolean");
  });
});

describe("normalizeOrderNumber", () => {
  it("uppercases the order number", () => {
    expect(normalizeOrderNumber("je1234")).toBe("JE1234");
  });

  it("trims whitespace", () => {
    expect(normalizeOrderNumber("  AB5678  ")).toBe("AB5678");
  });

  it("leaves already-uppercase unchanged", () => {
    expect(normalizeOrderNumber("ORD-001")).toBe("ORD-001");
  });

  it("handles mixed case", () => {
    expect(normalizeOrderNumber("Je1234")).toBe("JE1234");
  });

  it("keeps leading zeros in the stored form", () => {
    expect(normalizeOrderNumber("01050")).toBe("01050");
    expect(normalizeOrderNumber("001050")).toBe("001050");
    expect(normalizeOrderNumber("000")).toBe("000");
    expect(normalizeOrderNumber("0")).toBe("0");
  });
});

describe("order number duplicate key", () => {
  function storedMatches(pattern: string, stored: string): boolean {
    const source = pattern.replace(/\[\[:space:\]\]/g, "\\s");
    return new RegExp(source, "i").test(stored);
  }

  it("treats 01050, 1050, and 001050 as the same order and leaves a different number alone", () => {
    expect(orderNumberMatchKey("01050")).toBe("1050");
    expect(orderNumberMatchKey("1050")).toBe("1050");
    expect(orderNumberMatchKey("001050")).toBe("1050");
    expect(orderNumbersMatch("01050", "1050")).toBe(true);
    expect(orderNumbersMatch("1050", "001050")).toBe(true);
    expect(orderNumbersMatch("01050", "11050")).toBe(false);
    expect(orderNumbersMatch("01050", "010501")).toBe(false);

    const pattern = orderNumberMatchPattern("01050");
    expect(storedMatches(pattern, "01050")).toBe(true);
    expect(storedMatches(pattern, "1050")).toBe(true);
    expect(storedMatches(pattern, "001050")).toBe(true);
    expect(storedMatches(pattern, "11050")).toBe(false);
    expect(storedMatches(orderNumberMatchPattern("1050"), "01050")).toBe(true);
  });

  it("keeps a single zero when the number is only zeros, and does not treat a blank as zero", () => {
    expect(orderNumberMatchKey("0")).toBe("0");
    expect(orderNumberMatchKey("00")).toBe("0");
    expect(orderNumberMatchKey("000")).toBe("0");
    expect(orderNumberMatchKey("  000  ")).toBe("0");
    expect(orderNumbersMatch("0", "000")).toBe(true);
    expect(orderNumbersMatch("000", "0")).toBe(true);
    expect(orderNumberMatchKey("")).toBe("");
    expect(orderNumberMatchKey("   ")).toBe("");
    expect(orderNumbersMatch("", "0")).toBe(false);
    expect(orderNumbersMatch("000", "0001")).toBe(false);
    expect(storedMatches(orderNumberMatchPattern("000"), "0")).toBe(true);
    expect(storedMatches(orderNumberMatchPattern("0"), "000")).toBe(true);
    expect(storedMatches(orderNumberMatchPattern("0"), "10")).toBe(false);
    expect(storedMatches(orderNumberMatchPattern(""), "0")).toBe(false);
  });

  it("leaves non-numeric prefixes and internal zeros unchanged", () => {
    expect(orderNumberMatchKey("ORD-001")).toBe("ORD-001");
    expect(orderNumberMatchKey("ord-001")).toBe("ORD-001");
    expect(orderNumberMatchKey("JE01034")).toBe("JE01034");
    expect(orderNumberMatchKey("TMF001")).toBe("TMF001");
    expect(orderNumbersMatch("ORD-001", "ORD-1")).toBe(false);
    expect(orderNumbersMatch("ORD-001", "ORD-0001")).toBe(false);
    expect(orderNumbersMatch("JE01034", "JE1034")).toBe(false);
    expect(orderNumbersMatch("TMF001", "TMF1")).toBe(false);
    expect(orderNumbersMatch("je1234", "JE1234")).toBe(true);
    expect(orderNumbersMatch("00JE12", "JE12")).toBe(true);
    expect(storedMatches(orderNumberMatchPattern("ORD-001"), "ORD-1")).toBe(false);
    expect(storedMatches(orderNumberMatchPattern("JE1234"), "JE01234")).toBe(false);
    expect(storedMatches(orderNumberMatchPattern("A.B"), "AXB")).toBe(false);
    expect(storedMatches(orderNumberMatchPattern("A.B"), "A.B")).toBe(true);
  });

  it("uses the same rule for the database pattern and in-memory comparison", () => {
    const samples = [
      "01034", "1034", "001034", "0", "00", "000", "JE1234", "je1234",
      "ORD-001", "ORD-1", "JE01034", "TMF001", "11034", "10340", "  1034  ",
      "", "   ", "0JE12", "A.B", "A+B",
    ];
    for (const query of samples) {
      for (const stored of samples) {
        expect(storedMatches(orderNumberMatchPattern(query), stored)).toBe(orderNumbersMatch(query, stored));
      }
    }
  });

  it("finds 01034 from a search for 1034 and the other way around", () => {
    expect(orderNumberMatchesSearch("1034", "01034")).toBe(true);
    expect(orderNumberMatchesSearch("01034", "1034")).toBe(true);
    expect(orderNumberMatchesSearch("01034", "001034")).toBe(true);
    expect(orderNumberMatchesSearch("000", "0")).toBe(true);
    expect(orderNumberMatchesSearch("1034", "103")).toBe(true);
    expect(orderNumberMatchesSearch("01034", "10340")).toBe(false);
    expect(orderNumberMatchesSearch("ORD-001", "ORD-1")).toBe(false);
    expect(orderNumberMatchesSearch("JE1234", "ann")).toBe(false);
    expect(orderNumberMatchesSearch("1034", "   ")).toBe(false);
  });

  it("prefers the stored text that matches the query when two rows share a key", () => {
    const rows = [
      { id: "newer", order_number: "01034" },
      { id: "older", order_number: "1034" },
    ];
    expect(preferStoredOrderNumber(rows, "1034", (row) => row.order_number)?.id).toBe("older");
    expect(preferStoredOrderNumber(rows, "01034", (row) => row.order_number)?.id).toBe("newer");
    expect(preferStoredOrderNumber(rows, "001034", (row) => row.order_number)?.id).toBe("newer");
    expect(preferStoredOrderNumber([], "1034", (row: { order_number: string }) => row.order_number)).toBeNull();
  });
});

// ─── URL validation ──────────────────────────────────────────────────────────

describe("isValidUrl", () => {
  it("accepts a full https wetransfer.com URL", () => {
    expect(isValidUrl("https://wetransfer.com/downloads/abc123")).toBe(true);
  });

  it("accepts a shortened we.tl URL", () => {
    expect(isValidUrl("https://we.tl/abc123")).toBe(true);
  });

  it("accepts a URL without scheme (adds https://)", () => {
    expect(isValidUrl("wetransfer.com/downloads/xyz")).toBe(true);
  });

  it("accepts http:// URLs", () => {
    expect(isValidUrl("http://wetransfer.com/downloads/abc")).toBe(true);
  });

  it("accepts google drive URL", () => {
    expect(isValidUrl("https://drive.google.com/file/abc")).toBe(true);
  });

  it("accepts dropbox URL", () => {
    expect(isValidUrl("https://dropbox.com/s/abc")).toBe(true);
  });

  it("accepts a different valid domain", () => {
    expect(isValidUrl("https://example.com/download")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidUrl("")).toBe(false);
  });

  it("rejects plain text (no URL)", () => {
    expect(isValidUrl("not a url at all")).toBe(false);
  });
});

// ─── ensureHttps ─────────────────────────────────────────────────────────────

describe("ensureHttps", () => {
  it("leaves https:// URLs unchanged", () => {
    expect(ensureHttps("https://wetransfer.com/abc")).toBe("https://wetransfer.com/abc");
  });

  it("leaves http:// URLs unchanged", () => {
    expect(ensureHttps("http://wetransfer.com/abc")).toBe("http://wetransfer.com/abc");
  });

  it("prepends https:// when no scheme is present", () => {
    expect(ensureHttps("wetransfer.com/abc")).toBe("https://wetransfer.com/abc");
  });

  it("trims whitespace before checking", () => {
    expect(ensureHttps("  wetransfer.com/abc  ")).toBe("https://wetransfer.com/abc");
  });

  it("does not double-prepend https://", () => {
    const url = "https://wetransfer.com/abc";
    expect(ensureHttps(ensureHttps(url))).toBe(url);
  });
});
