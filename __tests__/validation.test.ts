import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  isKnownStatus,
  isWithinDedupWindow,
  normalizeCustomerName,
  normalizeEmail,
  normalizeOrderNumber,
  isValidWetransferLink,
  ensureHttps,
} from "../lib/validation";

// ─── Status transitions ───────────────────────────────────────────────────────

describe("isValidTransition", () => {
  it("allows forward: Received by Yours → Received at Lab", () => {
    expect(isValidTransition("Received by Yours", "Received at Lab")).toBe(true);
  });

  it("allows forward: Received at Lab → Scans Sent", () => {
    expect(isValidTransition("Received at Lab", "Scans Sent")).toBe(true);
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
});

// ─── Known status guard ───────────────────────────────────────────────────────

describe("isKnownStatus", () => {
  it("accepts all three valid statuses", () => {
    expect(isKnownStatus("Received by Yours")).toBe(true);
    expect(isKnownStatus("Received at Lab")).toBe(true);
    expect(isKnownStatus("Scans Sent")).toBe(true);
  });

  it("rejects unknown strings", () => {
    expect(isKnownStatus("")).toBe(false);
    expect(isKnownStatus("received by yours")).toBe(false); // wrong case
    expect(isKnownStatus("Pending")).toBe(false);
    expect(isKnownStatus("In Transit")).toBe(false);
  });
});

// ─── Email dedup window ───────────────────────────────────────────────────────

describe("isWithinDedupWindow", () => {
  it("returns false for null / undefined", () => {
    expect(isWithinDedupWindow(null)).toBe(false);
    expect(isWithinDedupWindow(undefined)).toBe(false);
  });

  it("returns true when sent 30 minutes ago", () => {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    expect(isWithinDedupWindow(thirtyMinsAgo)).toBe(true);
  });

  it("returns false when sent 2 hours ago", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(isWithinDedupWindow(twoHoursAgo)).toBe(false);
  });

  it("returns false when sent exactly 1 hour + 1 ms ago", () => {
    const justOver = new Date(Date.now() - (60 * 60 * 1000 + 1)).toISOString();
    expect(isWithinDedupWindow(justOver)).toBe(false);
  });

  it("returns true when sent just now", () => {
    expect(isWithinDedupWindow(new Date().toISOString())).toBe(true);
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
});

describe("normalizeEmail", () => {
  it("lowercases the email", () => {
    expect(normalizeEmail("Hello@YoursDurham.COM")).toBe("hello@yoursdurham.com");
  });

  it("trims whitespace", () => {
    expect(normalizeEmail("  user@example.com  ")).toBe("user@example.com");
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
});

// ─── WeTransfer link validation ───────────────────────────────────────────────

describe("isValidWetransferLink", () => {
  it("accepts a full wetransfer.com URL", () => {
    expect(isValidWetransferLink("https://wetransfer.com/downloads/abc123")).toBe(true);
  });

  it("accepts a URL without scheme (adds https://)", () => {
    expect(isValidWetransferLink("wetransfer.com/downloads/xyz")).toBe(true);
  });

  it("accepts http:// wetransfer URLs", () => {
    expect(isValidWetransferLink("http://wetransfer.com/downloads/abc")).toBe(true);
  });

  it("rejects a non-wetransfer URL", () => {
    expect(isValidWetransferLink("https://drive.google.com/file/abc")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidWetransferLink("")).toBe(false);
  });

  it("rejects a random domain", () => {
    expect(isValidWetransferLink("https://dropbox.com/s/abc")).toBe(false);
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
});
