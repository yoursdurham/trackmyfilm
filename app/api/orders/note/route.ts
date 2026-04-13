/**
 * POST /api/orders/note
 * Public endpoint — no auth required.
 * Allows customers to add a note to their own order.
 * Identified by order_number (public-facing).
 */

import { NextResponse } from "next/server";
import { getOrderByNumber, updateOrder } from "@/lib/db";
import { normalizeOrderNumber } from "@/lib/validation";

export async function POST(req: Request) {
  let body: { order_number: string; note: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { order_number, note } = body;

  if (!order_number?.trim()) {
    return NextResponse.json({ error: "order_number is required" }, { status: 400 });
  }
  if (!note?.trim()) {
    return NextResponse.json({ error: "note cannot be empty" }, { status: 400 });
  }
  if (note.trim().length > 1000) {
    return NextResponse.json({ error: "Note is too long (max 1000 characters)" }, { status: 400 });
  }

  try {
    const order = await getOrderByNumber(normalizeOrderNumber(order_number));
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    await updateOrder(order.id, { customer_notes: note.trim() });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
