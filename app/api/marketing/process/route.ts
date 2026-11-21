import { NextResponse } from "next/server";
import { marketingError, requireStaff } from "@/lib/marketing/http";
import { runDueSends } from "@/lib/marketing/store";

export async function POST() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  try {
    const result = await runDueSends();
    return NextResponse.json(result);
  } catch (error) {
    return marketingError(error);
  }
}
