import { describe, expect, it } from "vitest";
import {
  accountFavorites,
  accountGreetingName,
  accountProgress,
  buildAccountProfile,
  isAccountPreview,
  ordersForVerifiedEmail,
  previewAccountProfile,
} from "../lib/account-profile";
import type { AccountOrderInput } from "../lib/account-profile";

const NOW = new Date("2026-10-22T15:00:00.000Z");

function order(overrides: Partial<AccountOrderInput> = {}): AccountOrderInput {
  return {
    id: "order-1",
    order_number: "YM-1",
    customer_name: "Jane Doe",
    customer_email: "jane@example.com",
    status: "Received by Yours",
    roll_count: 1,
    film_type: "35mm",
    film_stock: "Kodak Portra 400",
    dropoff_date: "2026-04-25",
    received_by_yours_at: "2026-04-25T15:00:00.000Z",
    created_at: "2026-04-25T15:00:00.000Z",
    ...overrides,
  };
}

describe("account greeting", () => {
  it("uses the first name and last initial", () => {
    expect(accountGreetingName({ firstName: "Jane", lastName: "Doe" })).toBe("Jane D.");
    expect(accountGreetingName({ firstName: "Mary Ann", lastName: "smith" })).toBe("Mary Ann S.");
    expect(accountGreetingName({ firstName: "Jane" })).toBe("Jane");
    expect(accountGreetingName({ fullName: "Jane Doe" })).toBe("Jane D.");
    expect(accountGreetingName({ fullName: "Cher" })).toBe("Cher");
    expect(accountGreetingName({})).toBe("there");
  });
});

describe("account progress", () => {
  it("keeps ready for pickup in current orders and scans sent in history", () => {
    expect(accountProgress("Received by Yours", []).phase).toBe("current");
    expect(accountProgress("Received at Lab", []).steps.map((step) => step.reached)).toEqual([true, true, false]);
    const ready = accountProgress("Ready for Pickup", []);
    expect(ready.phase).toBe("current");
    expect(ready.steps.map((step) => step.reached)).toEqual([true, true, false]);
    const sent = accountProgress("Scans Sent", []);
    expect(sent.phase).toBe("history");
    expect(sent.steps.every((step) => step.reached)).toBe(true);
  });

  it("parks on hold on the last pipeline step and hides the staff reason", () => {
    const parked = accountProgress("On Hold", [
      { status: "Received by Yours", changed_at: "2026-09-12T15:00:00.000Z" },
      { status: "On Hold", changed_at: "2026-09-14T15:00:00.000Z" },
    ]);
    expect(parked.phase).toBe("current");
    expect(parked.onHold).toBe(true);
    expect(parked.steps.map((step) => step.reached)).toEqual([true, false, false]);
  });
});

describe("customer isolation in the profile builder", () => {
  it("drops another customer's rows even if they were returned", () => {
    const profile = buildAccountProfile({
      email: "Ada@Example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      orders: [
        order({ id: "ada", order_number: "TEST-ADA-1", customer_email: "ada@example.com" }),
        order({ id: "bea", order_number: "TEST-BEA-1", customer_email: "bea@example.com", customer_name: "Bea Knitter" }),
      ],
      now: NOW,
    });
    expect(profile.greetingName).toBe("Ada L.");
    expect(profile.current.map((entry) => entry.orderNumber)).toEqual(["TEST-ADA-1"]);
    expect(profile.stats.rolls_dropped_off).toBe("1");
    expect(ordersForVerifiedEmail([
      { customer_email: "ADA@example.com" },
      { customer_email: "bea@example.com" },
      { customer_email: null },
    ], "ada@example.com")).toEqual([{ customer_email: "ADA@example.com" }]);
  });

  it("excludes blank rolls from stats and links favorites by the most-used format", () => {
    const profile = previewAccountProfile(NOW);
    expect(profile.current.map((entry) => entry.orderNumber)).toEqual(["YM-1180", "YM-1108"]);
    expect(profile.history.map((entry) => entry.orderNumber)).toEqual(["YM-1042"]);
    expect(profile.history[0]?.downloads.map((download) => download.label)).toEqual(["Download scans"]);
    expect(profile.current.find((entry) => entry.orderNumber === "YM-1108")?.downloads[0]?.label).toBe("Download color scans");
    expect(profile.stats.rolls_dropped_off).toBe("6");
    expect(profile.stats.top_stock).toBe("Kodak Portra 400");
    expect(profile.stats.days_since_first_drop).toBe("180");
    expect(profile.favorites.find((favorite) => favorite.stock === "Kodak Portra 400")?.href)
      .toBe("https://www.yoursdurham.com/shopping/p/kodak-portra-400-35mm");
    expect(profile.current.find((entry) => entry.orderNumber === "YM-1180")?.holdMessage)
      .toBe("We're checking on this order");
    expect(JSON.stringify(profile)).not.toContain("hold_reason");
    expect(JSON.stringify(profile)).not.toContain("YM-9999");
  });

  it("leaves a favorite unlinked when two formats are tied", () => {
    const favorites = accountFavorites([
      order({
        roll_details: [
          { film_type: "35mm", film_process: "Color", film_stock: "Kodak Portra 400" },
          { film_type: "120", film_process: "Color", film_stock: "Kodak Portra 400" },
        ],
        roll_count: 2,
      }),
    ]);
    expect(favorites).toEqual([{ stock: "Kodak Portra 400", href: null }]);
  });
});

describe("account preview", () => {
  it("stays off in production", () => {
    expect(isAccountPreview("1", "production")).toBe(false);
    expect(isAccountPreview("1", "development")).toBe(true);
    expect(isAccountPreview(undefined, "development")).toBe(false);
  });
});
