import { NextResponse } from "next/server";
import { getCustomerByEmailOrName } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

// GET /api/customers/lookup?email=x&name=y
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    const name = searchParams.get("name");
    const customer = await getCustomerByEmailOrName(email, name);
    return NextResponse.json(customer ?? null);
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
