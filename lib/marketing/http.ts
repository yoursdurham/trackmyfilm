import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { MarketingStorageError } from "@/lib/marketing/supabase";
import { MarketingWriteError } from "@/lib/marketing/store";

export async function requireStaff() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  return auth;
}

export function marketingError(error: unknown) {
  if (error instanceof MarketingWriteError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof MarketingStorageError) {
    return NextResponse.json({ error: error.message, missingMigration: error.missingMigration }, { status: error.missingMigration ? 503 : 500 });
  }
  const message = error instanceof Error ? error.message : "Something went wrong.";
  console.error("[marketing]", message);
  return NextResponse.json({ error: "The marketing request could not be completed.", detail: message }, { status: 500 });
}
