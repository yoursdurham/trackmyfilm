import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

import { AccountEmailCodeStep } from "../app/account/login/AccountLoginForm";
import AccountLoginForm from "../app/account/login/AccountLoginForm";
import {
  ACCOUNT_EMAIL_OTP_LABEL,
  accountEmailOtpParams,
  isAccountEmailOtp,
  verifyAccountEmailCode,
} from "../lib/account-email-otp";

describe("account email code", () => {
  it("accepts only a 6-digit code, which is the Supabase Email OTP length", () => {
    expect(isAccountEmailOtp("482913")).toBe(true);
    expect(isAccountEmailOtp("48291")).toBe(false);
    expect(isAccountEmailOtp("4829137")).toBe(false);
    expect(isAccountEmailOtp("12345678")).toBe(false);
    expect(isAccountEmailOtp("48 29 13")).toBe(false);
    expect(accountEmailOtpParams("avery.sample@example.com", "482913")).toEqual({
      email: "avery.sample@example.com",
      token: "482913",
      type: "email",
    });
  });

  it("verifies with supabase.auth.verifyOtp({ email, token, type: 'email' })", async () => {
    const verify = vi.fn(async () => ({ error: null }));
    const ok = await verifyAccountEmailCode(verify, "avery.sample@example.com", "482 913");
    expect(ok).toEqual({ ok: true });
    expect(verify).toHaveBeenCalledWith({
      email: "avery.sample@example.com",
      token: "482913",
      type: "email",
    });

    const rejected = await verifyAccountEmailCode(
      async () => ({ error: { message: "Token has expired or is invalid" } }),
      "avery.sample@example.com",
      "482913",
    );
    expect(rejected).toEqual({
      ok: false,
      message: "That code is invalid or has expired. Request a new one.",
    });
    expect(rejected).not.toEqual(expect.objectContaining({
      message: expect.stringContaining("Token has expired"),
    }));
  });

  it("shows the code step only after a link is requested", () => {
    const request = renderToStaticMarkup(<AccountLoginForm linkError={false} />);
    expect(request).toContain("Email me a link");
    expect(request).not.toContain(ACCOUNT_EMAIL_OTP_LABEL);

    const step = renderToStaticMarkup(
      <AccountEmailCodeStep
        email="avery.sample@example.com"
        code="482913"
        loading={false}
        error={null}
        onCodeChange={() => {}}
        onSubmit={() => {}}
        onUseDifferentEmail={() => {}}
      />,
    );
    expect(step).toContain(ACCOUNT_EMAIL_OTP_LABEL);
    expect(step).toContain("avery.sample@example.com");
    expect(step).toContain('value="482913"');
    expect(step).toContain('autoComplete="one-time-code"');
    expect(step).toContain('maxLength="6"');
    expect(step).toContain(">Sign in<");
    expect(step).toContain("The link in that email signs you in too.");
  });
});
