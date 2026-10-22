import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { confirmFailurePath, PASSWORD_UPDATE_PATH, safeNextPath } from "@/lib/auth-redirect";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email",
  "email_change",
]);

function failureRedirect(origin: string, next: string | null) {
  return NextResponse.redirect(new URL(confirmFailurePath(next), origin));
}

/**
 * Turns a recovery email into a session cookie, then sends the browser to the
 * password form. Handles both the token-hash link (works on any device) and
 * the PKCE `code` the default Supabase email appends to redirectTo.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const typeParam = url.searchParams.get("type");
  const code = url.searchParams.get("code");
  const type = typeParam && OTP_TYPES.has(typeParam as EmailOtpType)
    ? typeParam as EmailOtpType
    : null;
  const requestedNext = safeNextPath(url.searchParams.get("next"));
  const next = requestedNext
    ?? (type === "recovery" || code ? PASSWORD_UPDATE_PATH : "/dashboard");

  let redirectResponse = NextResponse.redirect(new URL(next, url.origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          redirectResponse = NextResponse.redirect(new URL(next, url.origin));
          cookiesToSet.forEach(({ name, value, options }) => {
            redirectResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return redirectResponse;
    console.error("[GET /auth/confirm] verifyOtp", error.message);
    return failureRedirect(url.origin, requestedNext);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirectResponse;
    console.error("[GET /auth/confirm] exchangeCodeForSession", error.message);
    return failureRedirect(url.origin, requestedNext);
  }

  return failureRedirect(url.origin, requestedNext);
}
