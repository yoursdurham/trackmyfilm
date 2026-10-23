import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  LOG_IN_TO_VIEW_ORDERS_LABEL,
  VIEW_ALL_ORDERS_LABEL,
  LogInToViewOrdersButton,
  ViewAllOrdersLink,
  trackingAccountHref,
} from "../components/tracking/ViewAllOrdersLink";
import {
  LogInToViewOrdersButtonForSession,
  ViewAllOrdersLinkForSession,
} from "../components/tracking/ViewAllOrdersLinkForSession";
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

  it("renders the results link and the home login button as same-site links", () => {
    const link = renderToStaticMarkup(<ViewAllOrdersLink href="/account/login" />);
    expect(link).toContain(`>${VIEW_ALL_ORDERS_LABEL}<`);
    expect(link).toContain('href="/account/login"');
    expect(link).not.toContain("target=");

    const button = renderToStaticMarkup(<LogInToViewOrdersButton href="/account" />);
    expect(button).toContain(`>${LOG_IN_TO_VIEW_ORDERS_LABEL}<`);
    expect(button).toContain('href="/account"');
    expect(button).toContain("bg-[#C5AED7]");
    expect(button).not.toContain("target=");
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

    getUser.mockResolvedValueOnce({ data: { user: { email: "ada@example.com" } } });
    const button = renderToStaticMarkup(await LogInToViewOrdersButtonForSession());
    expect(button).toContain(LOG_IN_TO_VIEW_ORDERS_LABEL);
    expect(button).toContain('href="/account"');
  });

  it("leaves /account out of search indexes", () => {
    expect(accountMetadata.robots).toEqual({ index: false, follow: false });
    expect(robots().rules).toMatchObject({ userAgent: "*", disallow: "/account" });
  });
});
