import { describe, expect, it } from "vitest";
import { ORDER_STATUS } from "@/lib/constants";
import {
  countDashboardStatuses,
  isDashboardSentStatus,
  orderMatchesDashboardFilter,
} from "@/lib/dashboard-status";

const orders = [
  { id: "yours", status: ORDER_STATUS.RECEIVED_BY_YOURS },
  { id: "lab", status: ORDER_STATUS.RECEIVED_AT_LAB },
  { id: "pickup-a", status: ORDER_STATUS.READY_FOR_PICKUP },
  { id: "pickup-b", status: ORDER_STATUS.READY_FOR_PICKUP },
  { id: "sent", status: ORDER_STATUS.SCANS_SENT },
];

describe("dashboard sent grouping", () => {
  it("treats Ready for Pickup as the Scans Sent stage without renaming it", () => {
    expect(isDashboardSentStatus(ORDER_STATUS.READY_FOR_PICKUP)).toBe(true);
    expect(isDashboardSentStatus(ORDER_STATUS.SCANS_SENT)).toBe(true);
    expect(isDashboardSentStatus(ORDER_STATUS.RECEIVED_AT_LAB)).toBe(false);
    expect(orders.find((order) => order.id === "pickup-a")?.status).toBe("Ready for Pickup");
  });

  it("rolls Ready for Pickup into the Scans Sent card and leaves the other cards alone", () => {
    expect(countDashboardStatuses(orders)).toEqual({
      "Received by Yours": 1,
      "Received at Lab": 1,
      "Scans Sent": 3,
    });
  });

  it("includes Ready for Pickup orders in the Sent filter", () => {
    const sent = orders.filter((order) =>
      orderMatchesDashboardFilter(order, ORDER_STATUS.SCANS_SENT, false),
    );
    expect(sent.map((order) => order.id)).toEqual(["pickup-a", "pickup-b", "sent"]);
  });

  it("does not put Ready for Pickup orders in the earlier stage filters", () => {
    expect(orderMatchesDashboardFilter(orders[2], ORDER_STATUS.RECEIVED_BY_YOURS, false)).toBe(false);
    expect(orderMatchesDashboardFilter(orders[2], ORDER_STATUS.RECEIVED_AT_LAB, false)).toBe(false);
    expect(orderMatchesDashboardFilter(orders[2], "all", false)).toBe(true);
  });

  it("leaves urgency to the caller, including finished pickup orders", () => {
    expect(orderMatchesDashboardFilter(orders[2], "urgent", false)).toBe(false);
    expect(orderMatchesDashboardFilter(orders[0], "urgent", true)).toBe(true);
  });
});
