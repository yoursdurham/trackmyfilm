import { NextResponse } from "next/server";
import { getOrderByNumber, getOrdersByCustomerId, getCustomerByEmail } from "@/lib/db";
import { normalizeEmail } from "@/lib/validation";

// GET /api/orders/track?order_number=JE1234
// GET /api/orders/track?email=customer@email.com
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orderNumber = searchParams.get("order_number");
    const email = searchParams.get("email");

    if (orderNumber) {
      const order = await getOrderByNumber(orderNumber);
      return NextResponse.json(order ? [order] : []);
    }

    if (email) {
      const customer = await getCustomerByEmail(normalizeEmail(email));
      if (!customer) return NextResponse.json([]);
      const orders = await getOrdersByCustomerId(customer.id);
      return NextResponse.json({ customer, orders });
    }

    return NextResponse.json({ error: "order_number or email required" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Tracking lookup failed" }, { status: 500 });
  }
}
