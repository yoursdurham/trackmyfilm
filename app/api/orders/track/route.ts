import { NextResponse } from "next/server";
import { getOrderByNumber, getCustomerByEmail, getOrdersByCustomerId } from "@/lib/db";
import { normalizeEmail } from "@/lib/validation";
import { requireAuth } from "@/lib/api-auth";

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const orderNumber = searchParams.get("order_number");
    const email = searchParams.get("email");

    if (orderNumber) {
      const order = await getOrderByNumber(orderNumber.trim().toUpperCase());
      if (!order) return NextResponse.json([], { status: 200 });
      return NextResponse.json([order]);
    }

    if (email) {
      const normalized = normalizeEmail(email);
      const customer = await getCustomerByEmail(normalized);
      if (!customer) return NextResponse.json({ customer: null, orders: [] });
      const orders = await getOrdersByCustomerId(customer.id);
      return NextResponse.json({ customer, orders });
    }

    return NextResponse.json({ error: "order_number or email required" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
