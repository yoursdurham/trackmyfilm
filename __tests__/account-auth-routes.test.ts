import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authState = vi.hoisted(() => ({
  verifyError: null as { message: string } | null,
  exchangeError: null as { message: string } | null,
  signOut: vi.fn(async () => {}),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      verifyOtp: async () => ({ error: authState.verifyError }),
      exchangeCodeForSession: async () => ({ error: authState.exchangeError }),
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signOut: () => authState.signOut() },
  }),
}));

import { GET as confirmGet } from "../app/auth/confirm/route";
import { POST as logoutPost } from "../app/api/auth/logout/route";
import { confirmFailurePath, safeCustomerSignOutPath } from "../lib/auth-redirect";

describe("auth confirm for customer links", () => {
  beforeEach(() => {
    authState.verifyError = null;
    authState.exchangeError = null;
  });

  it("sends a failed account link back to account sign-in", async () => {
    authState.verifyError = { message: "expired" };
    const res = await confirmGet(new NextRequest(
      "http://localhost:3000/auth/confirm?token_hash=abc&type=email&next=/account",
    ));
    expect(res.headers.get("location")).toBe("http://localhost:3000/account/login?error=link");
  });

  it("keeps a failed staff recovery link on the staff login", async () => {
    authState.exchangeError = { message: "expired" };
    const res = await confirmGet(new NextRequest(
      "http://localhost:3000/auth/confirm?code=abc&next=/login/update-password",
    ));
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?error=reset");
    expect(confirmFailurePath("/login/update-password")).toBe("/login?error=reset");
    expect(confirmFailurePath("/account")).toBe("/account/login?error=link");
  });

  it("lands a successful account link on the profile", async () => {
    const res = await confirmGet(new NextRequest(
      "http://localhost:3000/auth/confirm?token_hash=abc&type=magiclink&next=/account",
    ));
    expect(res.headers.get("location")).toBe("http://localhost:3000/account");
  });
});

describe("customer sign-out", () => {
  beforeEach(() => {
    authState.signOut.mockClear();
  });

  it("returns to account sign-in only for that path", async () => {
    const res = await logoutPost(new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ next: "/account/login" }),
    }));
    expect(authState.signOut).toHaveBeenCalledTimes(1);
    expect(res.headers.get("location")).toBe("http://localhost:3000/account/login");
    expect(res.status).toBe(303);
  });

  it("ignores staff and off-site next values", async () => {
    expect(safeCustomerSignOutPath("/dashboard")).toBeNull();
    expect(safeCustomerSignOutPath("https://evil.example")).toBeNull();
    const res = await logoutPost(new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ next: "/dashboard" }),
    }));
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });
});
