import { NextResponse } from "next/server";
import { getOrderByNumber, getCustomerByEmail, getOrdersByCustomerId } from "@/lib/db";
import { normalizeEmail, normalizeOrderNumber } from "@/lib/validation";
import type { FilmOrder } from "@/lib/types";

function hasValidTrackingToken(token: string | null) {
  void token;
  // Future secure-token validation belongs here. Until then, public lookup
  // responses must never expose the download URL.
  return false;
}

function serializeOrderForTracking(order: FilmOrder, tokenIsValid: boolean) {
  if (tokenIsValid) return order;
  const publicOrder: Partial<FilmOrder> = { ...order };
  delete publicOrder.wetransfer_link;
  return publicOrder;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orderNumber = searchParams.get("order_number");
    const email = searchParams.get("email");
    const tokenIsValid = hasValidTrackingToken(searchParams.get("tracking_token"));

    if (orderNumber) {
      const order = await getOrderByNumber(normalizeOrderNumber(orderNumber));
      if (!order) return NextResponse.json([], { status: 200 });
      return NextResponse.json([serializeOrderForTracking(order, tokenIsValid)]);
    }

    if (email) {
      const normalized = normalizeEmail(email);
      const customer = await getCustomerByEmail(normalized);
      if (!customer) return NextResponse.json({ customer: null, orders: [] });
      const orders = await getOrdersByCustomerId(customer.id);
      return NextResponse.json({
        customer,
        orders: orders.map((order) => serializeOrderForTracking(order, tokenIsValid)),
      });
    }

    return NextResponse.json({ error: "order_number or email required" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
