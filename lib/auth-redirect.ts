/** Where a recovery link should land after the session cookie is written. */
export const PASSWORD_UPDATE_PATH = "/login/update-password";

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
