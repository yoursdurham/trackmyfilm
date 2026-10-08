/**
 * Staff and admin access checks. Server-only env vars.
 * STAFF_EMAILS and ADMIN_EMAILS must not use a NEXT_PUBLIC_ prefix.
 */

let staffAllowlistWarningLogged = false;

export function parseEmailAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * null when STAFF_EMAILS is missing or empty. An empty list is treated as
 * unset so a blank deploy cannot lock the shop out.
 */
export function staffEmailAllowlist(): string[] | null {
  const raw = process.env.STAFF_EMAILS;
  if (raw == null || raw.trim() === "") return null;
  const emails = parseEmailAllowlist(raw);
  return emails.length > 0 ? emails : null;
}

export function isStaffEmail(email: string | null | undefined): boolean {
  const allowlist = staffEmailAllowlist();
  if (!allowlist) {
    if (!staffAllowlistWarningLogged) {
      staffAllowlistWarningLogged = true;
      console.warn(
        "[auth] STAFF_EMAILS is not set. Any signed-in user is treated as staff until this env var is configured."
      );
    }
    return true;
  }
  if (!email) return false;
  return allowlist.includes(email.trim().toLowerCase());
}

export function resetStaffAuthWarningsForTests() {
  staffAllowlistWarningLogged = false;
}

/** ADMIN_EMAILS, or the existing NEXT_PUBLIC_ADMIN_EMAILS value if that is all that is set. */
export function adminEmailAllowlist(): string[] {
  return parseEmailAllowlist(process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS);
}

/**
 * Admin for /numbers. app_metadata.role is set in Supabase and is not editable
 * by the user. user_metadata.role is ignored.
 */
export function isAdminUser(user: {
  email?: string | null;
  app_metadata?: object | null;
}): boolean {
  const metadata = user.app_metadata;
  if (metadata && "role" in metadata && metadata.role === "admin") return true;
  const email = user.email?.trim().toLowerCase();
  if (!email) return false;
  return adminEmailAllowlist().includes(email);
}

export const STAFF_PATH_PREFIXES = [
  "/dashboard",
  "/customers",
  "/numbers",
  "/displays",
  "/reports",
] as const;

export function isStaffPath(pathname: string): boolean {
  return STAFF_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
