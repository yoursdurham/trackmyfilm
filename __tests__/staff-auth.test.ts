import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authState = vi.hoisted(() => ({
  user: null as { id: string; email?: string } | null,
  signOut: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: authState.user } }),
    },
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: authState.user } }),
      signOut: () => authState.signOut(),
    },
  }),
}));

import { requireAuth, STAFF_FORBIDDEN_MESSAGE } from "@/lib/api-auth";
import {
  isAdminUser,
  isStaffPath,
  resetStaffAuthWarningsForTests,
} from "@/lib/staff-auth";
import { proxy } from "@/proxy";

const ORIGINAL_ENV = {
  STAFF_EMAILS: process.env.STAFF_EMAILS,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  NEXT_PUBLIC_ADMIN_EMAILS: process.env.NEXT_PUBLIC_ADMIN_EMAILS,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("requireAuth", () => {
  beforeEach(() => {
    authState.user = null;
    authState.signOut.mockClear();
    resetStaffAuthWarningsForTests();
    delete process.env.STAFF_EMAILS;
  });

  afterEach(() => {
    restoreEnv();
  });

  it("rejects a signed-out caller", async () => {
    const res = await requireAuth();
    expect(res).toBeInstanceOf(Response);
    if (res instanceof Response) expect(res.status).toBe(401);
  });

  it("allows any signed-in user when STAFF_EMAILS is unset and warns once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    authState.user = { id: "user-1", email: "stranger@example.com" };

    const first = await requireAuth();
    const second = await requireAuth();

    expect(first).toEqual({ id: "user-1", email: "stranger@example.com" });
    expect(second).toEqual({ id: "user-1", email: "stranger@example.com" });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("allows only listed emails when STAFF_EMAILS is set", async () => {
    process.env.STAFF_EMAILS = "Owner@Shop.test, staff@shop.test";
    authState.user = { id: "owner", email: "owner@shop.test" };
    expect(await requireAuth()).toEqual({ id: "owner", email: "owner@shop.test" });

    authState.user = { id: "stranger", email: "stranger@example.com" };
    const denied = await requireAuth();
    expect(denied).toBeInstanceOf(Response);
    if (denied instanceof Response) {
      expect(denied.status).toBe(403);
      expect(await denied.json()).toEqual({ error: STAFF_FORBIDDEN_MESSAGE });
    }
  });
});

describe("numbers admin", () => {
  beforeEach(() => {
    delete process.env.ADMIN_EMAILS;
    delete process.env.NEXT_PUBLIC_ADMIN_EMAILS;
  });

  afterEach(() => {
    restoreEnv();
  });

  it("ignores user_metadata.role", () => {
    const user = {
      email: "ada@example.com",
      app_metadata: { role: "staff" },
      user_metadata: { role: "admin" },
    };
    expect(isAdminUser(user)).toBe(false);
  });

  it("accepts app_metadata.role admin", () => {
    expect(isAdminUser({
      email: "ada@example.com",
      app_metadata: { role: "admin" },
    })).toBe(true);
  });

  it("accepts ADMIN_EMAILS and falls back to NEXT_PUBLIC_ADMIN_EMAILS", () => {
    process.env.ADMIN_EMAILS = "Ada@Example.com";
    expect(isAdminUser({ email: "ada@example.com", app_metadata: {} })).toBe(true);

    delete process.env.ADMIN_EMAILS;
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = "ada@example.com";
    expect(isAdminUser({ email: "ADA@example.com", app_metadata: {} })).toBe(true);
    expect(isAdminUser({ email: "other@example.com", app_metadata: {} })).toBe(false);
  });
});

describe("staff pages", () => {
  beforeEach(() => {
    authState.user = null;
    authState.signOut.mockClear();
    resetStaffAuthWarningsForTests();
    delete process.env.STAFF_EMAILS;
  });

  afterEach(() => {
    restoreEnv();
  });

  it("protects reports and leaves the studio display public", () => {
    expect(isStaffPath("/reports")).toBe(true);
    expect(isStaffPath("/reports/weekly")).toBe(true);
    expect(isStaffPath("/customers/abc")).toBe(true);
    expect(isStaffPath("/displays")).toBe(true);
    expect(isStaffPath("/display/studio-vertical")).toBe(false);
    expect(isStaffPath("/tracking")).toBe(false);
  });

  it("sends anonymous visitors on /reports to login and leaves /display open", async () => {
    const reports = await proxy(new NextRequest("http://localhost/reports"));
    expect(reports.headers.get("location")).toContain("/login");
    expect(reports.headers.get("location")).toContain("redirectTo=%2Freports");

    const display = await proxy(new NextRequest("http://localhost/display/studio-vertical"));
    expect(display.headers.get("location")).toBeNull();
  });

  it("signs out a signed-in user who is not on STAFF_EMAILS", async () => {
    process.env.STAFF_EMAILS = "owner@shop.test";
    authState.user = { id: "stranger", email: "stranger@example.com" };

    const res = await proxy(new NextRequest("http://localhost/dashboard"));
    expect(authState.signOut).toHaveBeenCalledTimes(1);
    expect(res.headers.get("location")).toContain("/login");
    expect(res.headers.get("location")).toContain("error=not-staff");
  });
});
