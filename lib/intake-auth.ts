import { createHash, timingSafeEqual } from "crypto";

/** Server-only secret for the Squarespace intake bot. Never prefix with NEXT_PUBLIC_. */
export const SQUARESPACE_INTAKE_SECRET_ENV = "SQUARESPACE_INTAKE_SECRET";

/**
 * True only when Authorization is `Bearer <SQUARESPACE_INTAKE_SECRET>`.
 * A logged-in staff session is not accepted here.
 */
export function isSquarespaceIntakeAuthorized(req: Request): boolean {
  const secret = process.env[SQUARESPACE_INTAKE_SECRET_ENV];
  if (!secret) return false;

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;

  const token = header.slice("Bearer ".length);
  if (!token) return false;

  const tokenHash = createHash("sha256").update(token).digest();
  const secretHash = createHash("sha256").update(secret).digest();
  return timingSafeEqual(tokenHash, secretHash);
}
