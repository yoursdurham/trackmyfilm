import { NextResponse } from "next/server";
import { updateCustomer, deleteCustomer } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await req.json();
    // Whitelist updatable fields — prevent id/created_at/etc from being overwritten
    const { first_name, last_name, email, notes, total_rolls, total_dropoffs, normalized_name, last_dropoff_date, last_order_number, current_rolls } = body;
    const customer = await updateCustomer(id, { first_name, last_name, email, notes, total_rolls, total_dropoffs, normalized_name, last_dropoff_date, last_order_number, current_rolls });
    return NextResponse.json(customer);
  } catch {
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    await deleteCustomer(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 });
  }
}
