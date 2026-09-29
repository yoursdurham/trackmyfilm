import { NextResponse } from "next/server";
import { getCustomers, getCustomersWithSummaries, createCustomer } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { isValidEmail, normalizeEmail } from "@/lib/validation";

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const withStats = searchParams.get("stats") === "1";
    const customers = withStats ? await getCustomersWithSummaries() : await getCustomers();
    return NextResponse.json(customers);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GET /api/customers]", message);
    return NextResponse.json({ error: "Failed to fetch customers", detail: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const {
      first_name, last_name, email, phone, normalized_name, total_rolls, total_dropoffs,
      notes, preferred_contact_method, default_film_type, default_film_process,
      default_scan_size, default_delivery_preference,
      last_dropoff_date, last_order_number, current_rolls,
    } = body;

    if (email && !isValidEmail(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const customer = await createCustomer({
      user_id: auth.id,
      first_name,
      last_name,
      email: email ? normalizeEmail(email) : undefined,
      phone,
      normalized_name,
      total_rolls,
      total_dropoffs,
      notes,
      preferred_contact_method,
      default_film_type,
      default_film_process,
      default_scan_size,
      default_delivery_preference,
      last_dropoff_date,
      last_order_number,
      current_rolls,
    });
    return NextResponse.json(customer, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}
