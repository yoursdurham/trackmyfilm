import { isCustomerAccountTester, staffEmailAllowlist } from "@/lib/staff-auth";

/**
 * Public customer accounts stay off until this is exactly "true" or "1".
 * Leaving it unset keeps /account hidden. No other env var is required.
 */
export function customerAccountsEnabled(): boolean {
  const raw = process.env.CUSTOMER_ACCOUNTS_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

/**
 * True only when the address is written in STAFF_EMAILS.
 * An unset allowlist does not count. That fallback must not open /account.
 */
export function isListedStaffEmail(email: string | null | undefined): boolean {
  const allowlist = staffEmailAllowlist();
  if (!allowlist || !email) return false;
  return allowlist.includes(email.trim().toLowerCase());
}

/**
 * While public accounts are off, only an explicit staff address or
 * CUSTOMER_ACCOUNT_TESTERS address may open /account or finish the magic link.
 * A blank STAFF_EMAILS list does not qualify.
 */
export function customerAccountTestAllowed(email: string | null | undefined): boolean {
  return isListedStaffEmail(email) || isCustomerAccountTester(email);
}

/** Signed-out visitors and other customers are hidden while the public flag is off. */
export function customerAccountPageAllowed(email: string | null | undefined): boolean {
  if (customerAccountsEnabled()) return true;
  return customerAccountTestAllowed(email);
}
