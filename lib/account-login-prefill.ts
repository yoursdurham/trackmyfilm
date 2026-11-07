import { isValidEmail, normalizeEmail } from "@/lib/validation";

const MAX_EMAIL_LENGTH = 320;

/**
 * Email to show in the sign-in field when /account/login?email= is present.
 * Invalid or oversized values are ignored. Nothing is submitted from this.
 */
export function accountLoginEmailPrefill(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return "";
  const email = normalizeEmail(raw);
  if (!email || email.length > MAX_EMAIL_LENGTH || !isValidEmail(email)) return "";
  return email;
}
