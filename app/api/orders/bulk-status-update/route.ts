import { NextResponse } from "next/server";
import { STATUS_FLOW } from "@/lib/constants";
import { requireAuth } from "@/lib/api-auth";
import { isKnownStatus } from "@/lib/validation";
import { updateOrderStatus } from "@/lib/status-update-service";
import type { OrderStatus } from "@/lib/types";

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { orderIds, status } = await req.json() as {
      orderIds?: string[];
      status?: OrderStatus;
    };

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { error: "orderIds must be a non-empty array" },
        { status: 400 }
      );
    }

    if (!status || !isKnownStatus(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${STATUS_FLOW.join(", ")}` },
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

    const results = await Promise.all(
      uniqueOrderIds.map(async (orderId) => {
        const result = await updateOrderStatus({
          order_id: orderId,
          new_status: status,
          send_email: true,
        });
        return { orderId, ...result };
      })
    );

    const successes = results.filter((result) => result.success);
    const failures = results.filter((result) => !result.success);

    return NextResponse.json({
      success: failures.length === 0,
      status,
      successCount: successes.length,
      failureCount: failures.length,
      skippedCount: successes.filter((result) => result.skipped).length,
      results,
      failures: failures.map((result) => ({
        orderId: result.orderId,
        error: result.error ?? "Unknown error",
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
