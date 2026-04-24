import { NextResponse } from "next/server";
import { getOrderById, updateOrder, deleteOrder, getCustomerById, updateCustomer } from "@/lib/db";
import { ensureHttps } from "@/lib/validation";
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
      film_type, film_process, film_stock, roll_count, dropoff_date, dropoff_number, notes,
      roll_details, prints_4x6,
      wetransfer_link: rawWetransferLink,
      received_by_yours_at, at_lab_at, scans_sent_at,
      received_email_sent_at, at_lab_email_sent_at, scans_sent_email_sent_at,
      email_status, email_error,
    } = body;

    // Ensure wetransfer_link always has https:// scheme if provided
    const wetransfer_link = rawWetransferLink != null
      ? ensureHttps(rawWetransferLink)
      : rawWetransferLink;

    const order = await updateOrder(id, {
      order_number, customer_name, customer_email, status, status_history, status_updated_at,
      film_type, film_process, film_stock, roll_count, dropoff_date, dropoff_number,
      roll_details, prints_4x6, wetransfer_link, notes,
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

    // Fetch order before deleting so we can decrement customer totals
    const order = await getOrderById(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    await deleteOrder(id);

    // Best-effort: decrement customer totals — don't fail the delete if this errors
    if (order.customer_id) {
      try {
        const customer = await getCustomerById(order.customer_id);
        if (customer) {
          await updateCustomer(order.customer_id, {
            total_rolls:    Math.max(0, (customer.total_rolls    || 0) - (order.roll_count || 0)),
            total_dropoffs: Math.max(0, (customer.total_dropoffs || 0) - 1),
          });
        }
      } catch {
        console.error(`[deleteOrder] Failed to decrement totals for customer ${order.customer_id}`);
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete order" }, { status: 500 });
  }
}
