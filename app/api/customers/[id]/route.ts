import { NextResponse } from "next/server";
import { getCustomerProfile, updateCustomer, deleteCustomer } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { isValidEmail, normalizeEmail } from "@/lib/validation";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const profile = await getCustomerProfile(id);
    if (!profile) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    return NextResponse.json(profile);
  } catch {
    return NextResponse.json({ error: "Failed to fetch customer" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await req.json();
    const {
      first_name, last_name, email, phone, notes, total_rolls, total_dropoffs,
      normalized_name, last_dropoff_date, last_order_number, current_rolls,
      preferred_contact_method, default_film_type, default_film_process,
      default_scan_size, default_delivery_preference,
    } = body;

    if (email !== undefined && email !== null && email !== "" && !isValidEmail(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const customer = await updateCustomer(id, {
      first_name,
      last_name,
      email: email ? normalizeEmail(email) : email,
      phone,
      notes,
      total_rolls,
      total_dropoffs,
      normalized_name,
      last_dropoff_date,
      last_order_number,
      current_rolls,
      preferred_contact_method,
      default_film_type,
      default_film_process,
      default_scan_size,
      default_delivery_preference,
    });
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
