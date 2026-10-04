import { describe, expect, it } from "vitest";
import {
  PUBLIC_TRACKING_HOME,
  STAFF_HOME,
  isProtectedStaffPath,
  proxyRedirectPath,
  resolveProxyRedirect,
  safeStaffRedirect,
  staffOrderDetailPath,
} from "../lib/staff-navigation";

describe("staff order detail links", () => {
  it("points an order id at the staff detail route, not the public tracker", () => {
    expect(staffOrderDetailPath("order-01050")).toBe("/dashboard/orders/order-01050");
    expect(staffOrderDetailPath("abc def")).toBe("/dashboard/orders/abc%20def");
    expect(isProtectedStaffPath(staffOrderDetailPath("order-01050"))).toBe(true);
    expect(staffOrderDetailPath("order-01050").startsWith(PUBLIC_TRACKING_HOME)).toBe(false);
  });
});

describe("proxy redirects for logged-in staff", () => {
  it("sends anonymous visitors from / to the public tracking page", () => {
    expect(proxyRedirectPath("/", false)).toBe(PUBLIC_TRACKING_HOME);
  });

  it("sends logged-in staff from / to the dashboard instead of public tracking", () => {
    expect(proxyRedirectPath("/", true)).toBe(STAFF_HOME);
  });

  it("keeps a logged-in staff member on an order detail URL", () => {
    const path = staffOrderDetailPath("order-01050");
    expect(proxyRedirectPath(path, true)).toBeNull();
  });

  it("sends an anonymous visitor who opens an order detail URL to login, not tracking", () => {
    const path = staffOrderDetailPath("order-01050");
    expect(proxyRedirectPath(path, false)).toBe("/login");
    expect(proxyRedirectPath("/dashboard", false)).toBe("/login");
    expect(proxyRedirectPath("/customers/cust-1", false)).toBe("/login");
    expect(proxyRedirectPath("/numbers", false)).toBe("/login");
  });

  it("leaves the public tracking page alone for both sessions", () => {
    expect(proxyRedirectPath("/tracking", false)).toBeNull();
    expect(proxyRedirectPath("/tracking", true)).toBeNull();
  });

  it("sends a logged-in staff member away from the login page", () => {
    expect(proxyRedirectPath("/login", true)).toBe(STAFF_HOME);
    expect(proxyRedirectPath("/login", false)).toBeNull();
  });

  it("returns a logged-in staff member to the order they opened, not the public tracker", () => {
    const orderPath = staffOrderDetailPath("order-01050");
    expect(safeStaffRedirect(orderPath)).toBe(orderPath);
    expect(safeStaffRedirect("/tracking")).toBeNull();
    expect(safeStaffRedirect("//tracking")).toBeNull();
    expect(safeStaffRedirect("https://trackmyfilm.com/tracking")).toBeNull();
    expect(resolveProxyRedirect("/login", true, orderPath)).toBe(orderPath);
    expect(resolveProxyRedirect("/login", true, "/tracking")).toBe(STAFF_HOME);
    expect(resolveProxyRedirect("/", true, null)).toBe(STAFF_HOME);
  });
});
