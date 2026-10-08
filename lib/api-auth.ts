import { createClient } from "@/lib/supabase/server";
import { isStaffEmail } from "@/lib/staff-auth";
import { NextResponse } from "next/server";

export const STAFF_FORBIDDEN_MESSAGE = "This account does not have staff access.";

/**
 * Call at the top of any admin API route.
 * Returns { user } if the caller is staff, or a 401/403 NextResponse to return immediately.
 *
 * When STAFF_EMAILS is set, the signed-in email must be on that list.
 * When it is not set, any signed-in user is allowed and a warning is logged.
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
  if (!isStaffEmail(user.email)) {
    return NextResponse.json({ error: STAFF_FORBIDDEN_MESSAGE }, { status: 403 });
  }
  return { id: user.id, email: user.email };
}
