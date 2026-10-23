/**
 * Supabase Auth → Email → "Email OTP length" must be 6.
 * verifyOtp forwards the digits and does not know the configured length.
 * The sign-in form and the mailed code both assume that setting is 6.
 */
export const ACCOUNT_EMAIL_OTP_LENGTH = 6;

export const ACCOUNT_EMAIL_OTP_TYPE = "email" as const;

export const ACCOUNT_SIGN_IN_MESSAGE =
  "Check your email for a sign-in link. It may take a minute to arrive.";

export const ACCOUNT_EMAIL_OTP_LABEL = "Enter the 6-digit code from your email";

export const ACCOUNT_EMAIL_OTP_INVALID =
  "That code is invalid or has expired. Request a new one.";

const OTP_PATTERN = new RegExp(`^\\d{${ACCOUNT_EMAIL_OTP_LENGTH}}$`);

export function normalizeAccountEmailOtp(value: string): string {
  return value.replace(/\D/g, "").slice(0, ACCOUNT_EMAIL_OTP_LENGTH);
}

export function isAccountEmailOtp(value: string): boolean {
  return OTP_PATTERN.test(value);
}

export function accountEmailOtpParams(email: string, token: string): {
  email: string;
  token: string;
  type: typeof ACCOUNT_EMAIL_OTP_TYPE;
} {
  return {
    email,
    token,
    type: ACCOUNT_EMAIL_OTP_TYPE,
  };
}

type VerifyAccountEmailOtp = (params: {
  email: string;
  token: string;
  type: typeof ACCOUNT_EMAIL_OTP_TYPE;
}) => Promise<{ error: { message: string } | null }>;

/** Checks the code with supabase.auth.verifyOtp({ email, token, type: 'email' }). */
export async function verifyAccountEmailCode(
  verify: VerifyAccountEmailOtp,
  email: string,
  code: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const token = normalizeAccountEmailOtp(code);
  if (!isAccountEmailOtp(token)) {
    return { ok: false, message: ACCOUNT_EMAIL_OTP_LABEL };
  }
  const { error } = await verify(accountEmailOtpParams(email, token));
  if (error) return { ok: false, message: ACCOUNT_EMAIL_OTP_INVALID };
  return { ok: true };
}
