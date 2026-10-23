import { afterEach, describe, expect, it } from "vitest";
import {
  customerAccountPageAllowed,
  customerAccountsEnabled,
  isListedStaffEmail,
} from "../lib/customer-accounts";

const ORIGINAL_ACCOUNTS = process.env.CUSTOMER_ACCOUNTS_ENABLED;
const ORIGINAL_STAFF = process.env.STAFF_EMAILS;

afterEach(() => {
  if (ORIGINAL_ACCOUNTS === undefined) delete process.env.CUSTOMER_ACCOUNTS_ENABLED;
  else process.env.CUSTOMER_ACCOUNTS_ENABLED = ORIGINAL_ACCOUNTS;
  if (ORIGINAL_STAFF === undefined) delete process.env.STAFF_EMAILS;
  else process.env.STAFF_EMAILS = ORIGINAL_STAFF;
});

describe("customer account flag", () => {
  it("stays off unless the env is true or 1", () => {
    delete process.env.CUSTOMER_ACCOUNTS_ENABLED;
    expect(customerAccountsEnabled()).toBe(false);
    process.env.CUSTOMER_ACCOUNTS_ENABLED = "false";
    expect(customerAccountsEnabled()).toBe(false);
    process.env.CUSTOMER_ACCOUNTS_ENABLED = " TRUE ";
    expect(customerAccountsEnabled()).toBe(true);
    process.env.CUSTOMER_ACCOUNTS_ENABLED = "1";
    expect(customerAccountsEnabled()).toBe(true);
  });

  it("allows the pages for everyone only when the flag is on", () => {
    process.env.STAFF_EMAILS = "owner@shop.test";
    delete process.env.CUSTOMER_ACCOUNTS_ENABLED;
    expect(customerAccountPageAllowed(null)).toBe(false);
    expect(customerAccountPageAllowed("ada@example.com")).toBe(false);
    expect(customerAccountPageAllowed("owner@shop.test")).toBe(true);
    process.env.CUSTOMER_ACCOUNTS_ENABLED = "true";
    expect(customerAccountPageAllowed(null)).toBe(true);
    expect(customerAccountPageAllowed("ada@example.com")).toBe(true);
  });

  it("does not treat a blank STAFF_EMAILS list as every signed-in user", () => {
    delete process.env.STAFF_EMAILS;
    delete process.env.CUSTOMER_ACCOUNTS_ENABLED;
    expect(isListedStaffEmail("owner@shop.test")).toBe(false);
    expect(customerAccountPageAllowed("owner@shop.test")).toBe(false);
  });
});
