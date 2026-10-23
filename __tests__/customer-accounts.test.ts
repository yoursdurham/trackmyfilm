import { afterEach, describe, expect, it } from "vitest";
import {
  customerAccountPageAllowed,
  customerAccountTestAllowed,
  customerAccountsEnabled,
  isListedStaffEmail,
} from "../lib/customer-accounts";
import robots from "../app/robots";
import { metadata as accountMetadata } from "../app/account/layout";

const ORIGINAL_ACCOUNTS = process.env.CUSTOMER_ACCOUNTS_ENABLED;
const ORIGINAL_STAFF = process.env.STAFF_EMAILS;
const ORIGINAL_TESTERS = process.env.CUSTOMER_ACCOUNT_TESTERS;

afterEach(() => {
  if (ORIGINAL_ACCOUNTS === undefined) delete process.env.CUSTOMER_ACCOUNTS_ENABLED;
  else process.env.CUSTOMER_ACCOUNTS_ENABLED = ORIGINAL_ACCOUNTS;
  if (ORIGINAL_STAFF === undefined) delete process.env.STAFF_EMAILS;
  else process.env.STAFF_EMAILS = ORIGINAL_STAFF;
  if (ORIGINAL_TESTERS === undefined) delete process.env.CUSTOMER_ACCOUNT_TESTERS;
  else process.env.CUSTOMER_ACCOUNT_TESTERS = ORIGINAL_TESTERS;
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

  it("allows /account for listed staff and testers while the flag is off", () => {
    process.env.STAFF_EMAILS = "owner@shop.test";
    process.env.CUSTOMER_ACCOUNT_TESTERS = "Friend@Example.com";
    delete process.env.CUSTOMER_ACCOUNTS_ENABLED;
    expect(customerAccountPageAllowed(null)).toBe(false);
    expect(customerAccountPageAllowed("ada@example.com")).toBe(false);
    expect(customerAccountPageAllowed("owner@shop.test")).toBe(true);
    expect(customerAccountTestAllowed("friend@example.com")).toBe(true);
    expect(customerAccountPageAllowed("friend@example.com")).toBe(true);
    process.env.CUSTOMER_ACCOUNTS_ENABLED = "true";
    expect(customerAccountPageAllowed(null)).toBe(true);
    expect(customerAccountPageAllowed("ada@example.com")).toBe(true);
  });

  it("keeps /account out of search indexes", () => {
    expect(accountMetadata.robots).toEqual({ index: false, follow: false });
    expect(robots().rules).toMatchObject({ userAgent: "*", disallow: "/account" });
  });

  it("does not treat a blank STAFF_EMAILS list as every signed-in user", () => {
    delete process.env.STAFF_EMAILS;
    delete process.env.CUSTOMER_ACCOUNTS_ENABLED;
    expect(isListedStaffEmail("owner@shop.test")).toBe(false);
    expect(customerAccountPageAllowed("owner@shop.test")).toBe(false);
  });
});
