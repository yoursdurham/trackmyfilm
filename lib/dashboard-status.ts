import { ORDER_STATUS } from "@/lib/constants";

/**
 * The staff dashboard treats Ready for Pickup as the same finished stage as
 * Scans Sent. Stored order statuses are not rewritten.
 */
export function isDashboardSentStatus(status: string): boolean {
  return status === ORDER_STATUS.SCANS_SENT || status === ORDER_STATUS.READY_FOR_PICKUP;
}

export type DashboardStatusCounts = {
  "Received by Yours": number;
  "Received at Lab": number;
  "Scans Sent": number;
};

export function countDashboardStatuses(orders: { status: string }[]): DashboardStatusCounts {
  const counts: DashboardStatusCounts = {
    "Received by Yours": 0,
    "Received at Lab": 0,
    "Scans Sent": 0,
  };

  for (const order of orders) {
    if (order.status === ORDER_STATUS.RECEIVED_BY_YOURS) counts["Received by Yours"] += 1;
    else if (order.status === ORDER_STATUS.RECEIVED_AT_LAB) counts["Received at Lab"] += 1;
    else if (isDashboardSentStatus(order.status)) counts["Scans Sent"] += 1;
  }

  return counts;
}

/** True when an order belongs in the staff dashboard's active filter. */
export function orderMatchesDashboardFilter(
  order: { status: string },
  activeFilter: string,
  urgent: boolean,
): boolean {
  if (activeFilter === "all") return true;
  if (activeFilter === "urgent") return urgent;
  if (activeFilter === ORDER_STATUS.SCANS_SENT) return isDashboardSentStatus(order.status);
  return order.status === activeFilter;
}
