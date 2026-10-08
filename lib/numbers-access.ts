/** Staff header target for the Numbers tab. */
export const NUMBERS_PATH = "/numbers";

/**
 * Signed-out visitors go to login.
 * Signed-in staff stay on /numbers and see the financial view.
 * Do not send anyone to "/": the proxy rewrites that path to the public tracking page.
 */
export function numbersPageRedirect(isAuthenticated: boolean): "/login" | null {
  return isAuthenticated ? null : "/login";
}
