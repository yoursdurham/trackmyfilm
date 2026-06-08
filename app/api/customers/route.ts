import { NextResponse } from "next/server";
import { getCustomers, createCustomer } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const customers = await getCustomers();
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
      first_name, last_name, email, normalized_name, total_rolls, total_dropoffs,
      notes, last_dropoff_date, last_order_number, current_rolls,
    } = body;
    const customer = await createCustomer({
      first_name,
      last_name,
      email,
      normalized_name,
      total_rolls,
      total_dropoffs,
      notes,
      last_dropoff_date,
      last_order_number,
      current_rolls,
    });
    return NextResponse.json(customer, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}
