import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Call at the top of any admin API route.
 * Returns { user } if authenticated, or a 401 NextResponse to return immediately.
 *
 * Usage:
 *   const auth = await requireAuth();
 *   if (auth instanceof NextResponse) return auth;
 */
export async function requireAuth(): Promise<{ id: string; email?: string } | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { id: user.id, email: user.email };
}
