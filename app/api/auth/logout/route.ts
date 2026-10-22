import { safeCustomerSignOutPath } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const origin = new URL(req.url).origin;
  let nextPath = "/login";
  try {
    const form = await req.formData();
    const requested = safeCustomerSignOutPath(String(form.get("next") ?? ""));
    if (requested) nextPath = requested;
  } catch {
    // Staff sign-out posts no extra fields. The default stays the staff login.
  }
  return NextResponse.redirect(new URL(nextPath, origin), { status: 303 });
}
