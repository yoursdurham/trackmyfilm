/**
 * POST /api/orders/note
 *
 * Staff-only. No page in this app calls this route: dashboard order notes
 * are saved with PATCH /api/orders/[id], and the public tracking page only
 * reads /api/orders/track. customer_notes is shown to staff and omitted from
 * public tracking, so an anonymous caller must not be able to write it.
 *
 * The update sets customer_notes only. Staff `notes` and every other order
 * field are left unchanged.
 */

import { NextResponse } from "next/server";
import { getOrderByNumber, updateOrder } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { normalizeOrderNumber } from "@/lib/validation";

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  let body: { order_number?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orderNumber = body?.order_number;
  const note = body?.note;

  if (typeof orderNumber !== "string" || !orderNumber.trim()) {
    return NextResponse.json({ error: "order_number is required" }, { status: 400 });
  }
  if (typeof note !== "string" || !note.trim()) {
    return NextResponse.json({ error: "note cannot be empty" }, { status: 400 });
  }
  const trimmed = note.trim();
  if (trimmed.length > 1000) {
    return NextResponse.json({ error: "Note is too long (max 1000 characters)" }, { status: 400 });
  }

  try {
    const order = await getOrderByNumber(normalizeOrderNumber(orderNumber));
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    await updateOrder(order.id, { customer_notes: trimmed });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
