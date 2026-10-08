import { NextResponse } from "next/server";
import { getOrders } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const orders = await getOrders("desc");
    return NextResponse.json(orders);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GET /api/orders]", message);
    return NextResponse.json({ error: "Failed to fetch orders", detail: message }, { status: 500 });
  }
}
