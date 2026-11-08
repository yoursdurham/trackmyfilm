import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { accountLoginEmailPrefill } from "../lib/account-login-prefill";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

import AccountLoginPage from "../app/account/login/page";

describe("account login email prefill", () => {
  it("keeps a real address and ignores anything else", () => {
    expect(accountLoginEmailPrefill("  Ada@Example.com ")).toBe("ada@example.com");
    expect(accountLoginEmailPrefill(["Jane+Drop@Example.com", "other@example.com"])).toBe("jane+drop@example.com");
    expect(accountLoginEmailPrefill("not-an-email")).toBe("");
    expect(accountLoginEmailPrefill("")).toBe("");
    expect(accountLoginEmailPrefill(undefined)).toBe("");
    expect(accountLoginEmailPrefill("a@b.c".padEnd(400, "a"))).toBe("");
  });

  it("renders the prefilled field and does not start on the code step", async () => {
    const element = await AccountLoginPage({
      searchParams: Promise.resolve({ email: "  Ada@Example.com " }),
    });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('value="ada@example.com"');
    expect(html).toContain("Your film, all together");
    expect(html).toContain("dropped off at Yours,");
    expect(html).toContain("the film stocks you&#x27;ve shot");
    expect(html).toContain("No password needed.");
    expect(html).toContain("Your past orders show up as soon as you sign in.");
    expect(html).not.toContain("First time here");
    expect(html).not.toContain("free Track My Film account");
    expect(html).toContain("Email me a link");
    expect(html).not.toContain("Check your email");
    expect(html).not.toContain("Sending the link");
  });

  it("leaves the field empty when the query is not an email", async () => {
    const element = await AccountLoginPage({
      searchParams: Promise.resolve({ email: "javascript:alert(1)" }),
    });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('value=""');
    expect(html).not.toContain("javascript:");
  });
});
