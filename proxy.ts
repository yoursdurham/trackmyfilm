import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PASSWORD_UPDATE_PATH } from "@/lib/auth-redirect";
import { isStaffEmail, isStaffPath } from "@/lib/staff-auth";

const NOT_STAFF_ERROR = "not-staff";

function requestHasAuthHandoff(url: URL) {
  return url.searchParams.has("code")
    || url.searchParams.has("token_hash")
    || url.searchParams.get("type") === "recovery";
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const authCookies: { name: string; value: string; options?: Parameters<NextResponse["cookies"]["set"]>[2] }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            const index = authCookies.findIndex((cookie) => cookie.name === name);
            const next = { name, value, options };
            if (index >= 0) authCookies[index] = next;
            else authCookies.push(next);
          });
          supabaseResponse = NextResponse.next({ request });
          authCookies.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  function redirectKeepingAuthCookies(url: URL) {
    const redirect = NextResponse.redirect(url);
    authCookies.forEach(({ name, value, options }) => {
      redirect.cookies.set(name, value, options);
    });
    return redirect;
  }

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
    return redirectKeepingAuthCookies(confirmUrl);
  }

  const isProtected = isStaffPath(path);
  const staff = user ? isStaffEmail(user.email) : false;

  // Signed-in account that is not on STAFF_EMAILS. Sign them out so the
  // session cannot be reused, and tell them why on the login page.
  if (user && !staff && (isProtected || path === "/login")) {
    await supabase.auth.signOut();
    if (path === "/login" && request.nextUrl.searchParams.get("error") === NOT_STAFF_ERROR) {
      return supabaseResponse;
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("error", NOT_STAFF_ERROR);
    return redirectKeepingAuthCookies(loginUrl);
  }

  // Unauthenticated user hitting a protected route → send to login
  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", path);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated staff hitting /login → send to dashboard
  if (path === "/login" && user && staff) {
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
