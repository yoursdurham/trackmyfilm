import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  VIEW_ALL_ORDERS_LABEL,
  ViewAllOrdersLink,
  trackingAccountHref,
} from "../components/tracking/ViewAllOrdersLink";
import { ViewAllOrdersLinkForSession } from "../components/tracking/ViewAllOrdersLinkForSession";
import robots from "../app/robots";
import { metadata as accountMetadata } from "../app/account/layout";

const getUser = vi.hoisted(() => vi.fn(async () => ({ data: { user: null as { email: string } | null } })));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
  }),
}));

describe("View all your orders link", () => {
  afterEach(() => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: null } });
  });

  it("points signed-out visitors at the login page and signed-in visitors at the account", () => {
    expect(trackingAccountHref(false)).toBe("/account/login");
    expect(trackingAccountHref(true)).toBe("/account");
  });

  it("renders the label as a same-site link", () => {
    const html = renderToStaticMarkup(<ViewAllOrdersLink href="/account/login" />);
    expect(html).toContain(`>${VIEW_ALL_ORDERS_LABEL}<`);
    expect(html).toContain('href="/account/login"');
    expect(html).not.toContain("target=");
  });

  it("uses the session when it can, and the login page when it cannot", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    const signedOut = renderToStaticMarkup(await ViewAllOrdersLinkForSession());
    expect(signedOut).toContain('href="/account/login"');

    getUser.mockResolvedValueOnce({ data: { user: { email: "ada@example.com" } } });
    const signedIn = renderToStaticMarkup(await ViewAllOrdersLinkForSession());
    expect(signedIn).toContain('href="/account"');
    expect(signedIn).toContain(VIEW_ALL_ORDERS_LABEL);

    getUser.mockRejectedValueOnce(new Error("supabase unavailable"));
    const failed = renderToStaticMarkup(await ViewAllOrdersLinkForSession());
    expect(failed).toContain('href="/account/login"');
  });

  it("leaves /account out of search indexes", () => {
    expect(accountMetadata.robots).toEqual({ index: false, follow: false });
    expect(robots().rules).toMatchObject({ userAgent: "*", disallow: "/account" });
  });
});
