import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveProxyRedirect } from "@/lib/staff-navigation";

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
  const redirectPath = resolveProxyRedirect(
    path,
    Boolean(user),
    request.nextUrl.searchParams.get("redirectTo"),
  );

  if (redirectPath) {
    const destination = request.nextUrl.clone();
    destination.pathname = redirectPath;
    if (redirectPath === "/login") {
      const returnTo = `${path}${request.nextUrl.search}`;
      destination.search = "";
      destination.searchParams.set("redirectTo", returnTo);
    } else if (path === "/login") {
      destination.search = "";
    }
    return NextResponse.redirect(destination);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api).*)",
  ],
};
