/** Staff home. Logged-in visits to `/` go here instead of the public tracker. */
export const STAFF_HOME = "/dashboard";

/** Public homepage. Anonymous visits to `/` land on the tracking search page. */
export const PUBLIC_TRACKING_HOME = "/tracking";

const PROTECTED_PREFIXES = [STAFF_HOME, "/customers", "/numbers"] as const;

export function isProtectedStaffPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Where the proxy should send this path, or null to continue.
 * Logged-in staff who hit the site root stay in the dashboard.
 * Anonymous visitors still get the public tracking page.
 */
export function proxyRedirectPath(pathname: string, isAuthenticated: boolean): string | null {
  if (isProtectedStaffPath(pathname) && !isAuthenticated) return "/login";
  if (pathname === "/login" && isAuthenticated) return STAFF_HOME;
  if (pathname === "/") return isAuthenticated ? STAFF_HOME : PUBLIC_TRACKING_HOME;
  return null;
}

function staffPathOnly(value: string): string {
  const path = value.split("?")[0]?.split("#")[0] ?? "";
  return path;
}

/** Internal staff paths only. Rejects protocol-relative and public tracking URLs. */
export function safeStaffRedirect(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  const path = staffPathOnly(value);
  if (!isProtectedStaffPath(path)) return null;
  return path;
}

/**
 * Same as proxyRedirectPath, except a logged-in visit to /login follows a
 * safe redirectTo (for example /dashboard/orders/:id) instead of the dashboard root.
 */
export function resolveProxyRedirect(
  pathname: string,
  isAuthenticated: boolean,
  redirectTo: string | null,
): string | null {
  const target = proxyRedirectPath(pathname, isAuthenticated);
  if (target === STAFF_HOME && pathname === "/login" && isAuthenticated) {
    return safeStaffRedirect(redirectTo) ?? STAFF_HOME;
  }
  return target;
}

/** Staff detail page for one film order. Stays under /dashboard so the session gate applies. */
export function staffOrderDetailPath(orderId: string): string {
  return `${STAFF_HOME}/orders/${encodeURIComponent(orderId)}`;
}
