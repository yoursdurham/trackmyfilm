import { NextResponse } from "next/server";
import { getOrders, createOrder, getOrderByNumber } from "@/lib/db";
import { normalizeOrderNumber } from "@/lib/validation";
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

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();

    // Duplicate order number check — normalize before both check and insert
    if (body.order_number) {
      body.order_number = normalizeOrderNumber(body.order_number);
      const existing = await getOrderByNumber(body.order_number);
      if (existing) {
        return NextResponse.json(
          { error: `Order number ${body.order_number} already exists` },
          { status: 409 }
        );
      }
    }

    const order = await createOrder(body);
    return NextResponse.json(order, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
