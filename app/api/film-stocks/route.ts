import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getDistinctFilmStocks } from "@/lib/db";

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const stocks = await getDistinctFilmStocks();
    return NextResponse.json(stocks);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
