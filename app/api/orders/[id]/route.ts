import { NextResponse } from "next/server";
import { getOrderById, updateOrder, deleteOrder } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const order = await getOrderById(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json(order);
  } catch {
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await req.json();
    // Whitelist updatable fields — prevent id/customer_id/created_at from being overwritten
    const {
      order_number, customer_name, customer_email, status, status_history, status_updated_at,
      film_type, film_process, roll_count, dropoff_date, dropoff_number, wetransfer_link, notes,
      received_by_yours_at, at_lab_at, scans_sent_at,
      received_email_sent_at, at_lab_email_sent_at, scans_sent_email_sent_at,
      email_status, email_error,
    } = body;
    const order = await updateOrder(id, {
      order_number, customer_name, customer_email, status, status_history, status_updated_at,
      film_type, film_process, roll_count, dropoff_date, dropoff_number, wetransfer_link, notes,
      received_by_yours_at, at_lab_at, scans_sent_at,
      received_email_sent_at, at_lab_email_sent_at, scans_sent_email_sent_at,
      email_status, email_error,
    });
    return NextResponse.json(order);
  } catch {
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    await deleteOrder(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete order" }, { status: 500 });
  }
}
