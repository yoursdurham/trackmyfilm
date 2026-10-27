import { NextResponse } from "next/server";
import { KNOWN_ORDER_STATUSES } from "@/lib/constants";
import { requireAuth } from "@/lib/api-auth";
import { bulkUpdateOrderStatus } from "@/lib/bulk-status";
import { isKnownStatus } from "@/lib/validation";
import type { OrderStatus } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { orderIds, status, emailsOnly } = await req.json() as {
      orderIds?: string[];
      status?: OrderStatus;
      emailsOnly?: boolean;
    };

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { error: "orderIds must be a non-empty array" },
        { status: 400 }
      );
    }

    if (!status || !isKnownStatus(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${KNOWN_ORDER_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    if (emailsOnly !== undefined && typeof emailsOnly !== "boolean") {
      return NextResponse.json(
        { error: "emailsOnly must be a boolean" },
        { status: 400 }
      );
    }

    const uniqueOrderIds = [...new Set(orderIds.filter((id) => typeof id === "string" && id.trim()))];
    if (uniqueOrderIds.length === 0) {
      return NextResponse.json(
        { error: "orderIds must contain at least one valid order id" },
        { status: 400 }
      );
    }

    const result = await bulkUpdateOrderStatus({
      orderIds: uniqueOrderIds,
      status,
      emailsOnly: emailsOnly === true,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
