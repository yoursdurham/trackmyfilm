import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PASSWORD_UPDATE_PATH } from "@/lib/auth-redirect";

const PROTECTED = ["/dashboard", "/customers", "/numbers", "/displays"];

function requestHasAuthHandoff(url: URL) {
  return url.searchParams.has("code")
    || url.searchParams.has("token_hash")
    || url.searchParams.get("type") === "recovery";
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — required for SSR auth to stay alive
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Recovery emails sometimes land on the site root (the Site URL). Sending
  // that request to /tracking drops the one-time code before a session exists.
  if (path !== "/auth/confirm" && requestHasAuthHandoff(request.nextUrl)) {
    const confirmUrl = request.nextUrl.clone();
    confirmUrl.pathname = "/auth/confirm";
    if (!confirmUrl.searchParams.get("next")) {
      confirmUrl.searchParams.set("next", PASSWORD_UPDATE_PATH);
    }
    const redirect = NextResponse.redirect(confirmUrl);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie);
    });
    return redirect;
  }

  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(p + "/"));

  // Unauthenticated user hitting a protected route → send to login
  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", path);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user hitting /login → send to dashboard
  if (path === "/login" && user) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  // Root → public tracking page
  if (path === "/") {
    const trackingUrl = request.nextUrl.clone();
    trackingUrl.pathname = "/tracking";
    return NextResponse.redirect(trackingUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api).*)",
  ],
};
