/** Where a recovery link should land after the session cookie is written. */
export const PASSWORD_UPDATE_PATH = "/login/update-password";

export const ACCOUNT_PATH = "/account";
export const ACCOUNT_LOGIN_PATH = "/account/login";

/**
 * Accept only same-site paths. Reject protocol-relative and backslash tricks
 * so the recovery `next` parameter cannot leave trackmyfilm.com.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (next.includes("\\") || next.includes("://") || next.includes("\0")) return null;
  return next;
}

export function isAccountFlowPath(next: string | null | undefined): boolean {
  if (!next) return false;
  return next === ACCOUNT_PATH || next.startsWith(`${ACCOUNT_PATH}/`);
}

/** Failed customer links return to the account sign-in page, not the staff login. */
export function confirmFailurePath(next: string | null | undefined): string {
  return isAccountFlowPath(next) ? `${ACCOUNT_LOGIN_PATH}?error=link` : "/login?error=reset";
}

/** Sign-out from the profile page. Staff paths and off-site values are ignored. */
export function safeCustomerSignOutPath(next: string | null | undefined): string | null {
  const path = safeNextPath(next);
  if (path !== ACCOUNT_LOGIN_PATH) return null;
  return path;
}
