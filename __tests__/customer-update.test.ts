import { describe, it, expect } from "vitest";
import {
  applyNormalizedNameToPatch,
  buildCustomerPatchFromBody,
  customerEmailWillChange,
  normalizedNameFromCustomerParts,
} from "../lib/customer-update";
import type { Customer } from "../lib/types";

const baseCustomer: Customer = {
  id: "c1",
  first_name: "Jane",
  last_name: "Doe",
  email: "jane@example.com",
  total_rolls: 1,
  total_dropoffs: 1,
  normalized_name: "jane doe",
};

describe("buildCustomerPatchFromBody", () => {
  it("only includes fields present in the body", () => {
    const { patch } = buildCustomerPatchFromBody({ notes: "VIP" });
    expect(patch).toEqual({ notes: "VIP" });
    expect(patch.first_name).toBeUndefined();
  });

  it("requires non-empty first name when first_name is sent", () => {
    const { error } = buildCustomerPatchFromBody({ first_name: "  " });
    expect(error).toMatch(/first name/i);
  });

  it("trims identity fields", () => {
    const { patch } = buildCustomerPatchFromBody({
      first_name: " Justin ",
      last_name: " Eisner ",
      email: "contact@example.com",
      phone: " 919-555-0100 ",
    });
    expect(patch.first_name).toBe("Justin");
    expect(patch.last_name).toBe("Eisner");
    expect(patch.email).toBe("contact@example.com");
    expect(patch.phone).toBe("919-555-0100");
  });
});

describe("normalizedNameFromCustomerParts", () => {
  it("matches drop-off customer name normalization", () => {
    expect(normalizedNameFromCustomerParts("Justin", "Eisner")).toBe("justin eisner");
  });
});

describe("applyNormalizedNameToPatch", () => {
  it("updates normalized_name when email identity name changes", () => {
    const patch = applyNormalizedNameToPatch({ first_name: "Justin" }, baseCustomer);
    expect(patch.normalized_name).toBe("justin doe");
  });
});

describe("customerEmailWillChange", () => {
  it("detects email corrections", () => {
    expect(customerEmailWillChange(baseCustomer, { email: "new@example.com" })).toBe(true);
    expect(customerEmailWillChange(baseCustomer, { email: "jane@example.com" })).toBe(false);
    expect(customerEmailWillChange(baseCustomer, { phone: "555" })).toBe(false);
  });
});
