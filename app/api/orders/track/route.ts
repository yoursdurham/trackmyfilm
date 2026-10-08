import { NextResponse } from "next/server";
import { getCustomerByEmail, getOrderByNumberAndEmail, getOrdersByCustomerId } from "@/lib/db";
import { emailsMatchExact, normalizeEmail, normalizeOrderNumber } from "@/lib/validation";
import { customerFirstName, serializeOrderForPublicTracking } from "@/lib/tracking-public";

function notFoundOrder() {
  return NextResponse.json([]);
}

function notFoundEmailLookup() {
  return NextResponse.json({ first_name: null, orders: [] });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orderNumberRaw = searchParams.get("order_number");
    const emailRaw = searchParams.get("email");
    const orderNumber = orderNumberRaw ? normalizeOrderNumber(orderNumberRaw) : "";
    const email = emailRaw ? normalizeEmail(emailRaw) : "";

    if (orderNumber) {
      if (!email) {
        return NextResponse.json(
          { error: "order_number and email are required" },
          { status: 400 }
        );
      }
      const order = await getOrderByNumberAndEmail(orderNumber, email);
      if (!order || !emailsMatchExact(order.customer_email, email)) {
        return notFoundOrder();
      }
      return NextResponse.json([serializeOrderForPublicTracking(order)]);
    }

    if (email) {
      const customer = await getCustomerByEmail(email);
      if (!customer || !emailsMatchExact(customer.email, email)) {
        return notFoundEmailLookup();
      }
      const orders = await getOrdersByCustomerId(customer.id);
      return NextResponse.json({
        first_name: customerFirstName(customer.first_name),
        orders: orders.map((order) => serializeOrderForPublicTracking(order)),
      });
    }

    return NextResponse.json({ error: "order_number or email required" }, { status: 400 });
  } catch (err: unknown) {
    console.error("[GET /api/orders/track]", err);
    return NextResponse.json({ error: "Search unavailable" }, { status: 500 });
  }
}
