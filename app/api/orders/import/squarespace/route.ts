import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { importSquarespaceOrder } from "@/lib/pending-intake-service";
import type { SquarespaceImportInput } from "@/lib/pending-intake";

/** Staff-authenticated Squarespace import (same payload as webhook). */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  let body: SquarespaceImportInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await importSquarespaceOrder(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }

  return NextResponse.json(
    {
      success: true,
      order: result.order,
      customer_id: result.customerId,
      created_customer: result.createdCustomer,
    },
    { status: 201 }
  );
}
