import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.hoisted(() => vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null })));
const from = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithOtp },
    from,
  }),
}));

import { ACCOUNT_SIGN_IN_MESSAGE, POST, resetAccountSignInStateForTests } from "../app/api/account/sign-in/route";

const ORIGINAL_STAFF = process.env.STAFF_EMAILS;
const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

function request(email: unknown, ip = "203.0.113.10") {
  return new Request("http://localhost:3000/api/account/sign-in", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ email }),
  });
}

describe("POST /api/account/sign-in", () => {
  beforeEach(() => {
    signInWithOtp.mockClear();
    signInWithOtp.mockResolvedValue({ error: null });
    from.mockClear();
    resetAccountSignInStateForTests();
    process.env.STAFF_EMAILS = "owner@shop.test";
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    if (ORIGINAL_STAFF === undefined) delete process.env.STAFF_EMAILS;
    else process.env.STAFF_EMAILS = ORIGINAL_STAFF;
    if (ORIGINAL_APP_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
  });

  it("sends a magic link and the same message for a real address", async () => {
    const res = await POST(request("  Ada@Example.com "));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "ada@example.com",
      options: {
        emailRedirectTo: "http://localhost:3000/auth/confirm?next=/account",
        shouldCreateUser: true,
      },
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("uses the same message when the address is invalid, unknown, or Supabase refuses signups", async () => {
    const invalid = await POST(request("not-an-email"));
    expect(await invalid.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
    expect(signInWithOtp).not.toHaveBeenCalled();

    signInWithOtp.mockResolvedValueOnce({ error: { message: "Signups not allowed for this instance" } });
    const refused = await POST(request("new@example.com", "203.0.113.11"));
    expect(refused.status).toBe(200);
    expect(await refused.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
  });

  it("does not send a link when STAFF_EMAILS is unset, and still answers the same way", async () => {
    delete process.env.STAFF_EMAILS;
    const res = await POST(request("ada@example.com", "203.0.113.12"));
    expect(await res.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("rate-limits by IP without a different response", async () => {
    const ip = "203.0.113.13";
    for (let i = 0; i < 3; i += 1) {
      const res = await POST(request(`person${i}@example.com`, ip));
      expect(await res.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
    }
    expect(signInWithOtp).toHaveBeenCalledTimes(3);
    const limited = await POST(request("person4@example.com", ip));
    expect(limited.status).toBe(200);
    expect(await limited.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
    expect(signInWithOtp).toHaveBeenCalledTimes(3);
  });

  it("prefers NEXT_PUBLIC_APP_URL for the magic-link redirect", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://trackmyfilm.com/";
    await POST(request("ada@example.com", "203.0.113.14"));
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "ada@example.com",
      options: {
        emailRedirectTo: "https://trackmyfilm.com/auth/confirm?next=/account",
        shouldCreateUser: true,
      },
    });
  });
});
