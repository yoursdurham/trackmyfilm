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
  } catch {
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();

    // Duplicate order number check
    if (body.order_number) {
      const existing = await getOrderByNumber(normalizeOrderNumber(body.order_number));
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
