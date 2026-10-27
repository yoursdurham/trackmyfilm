import { NextResponse } from "next/server";
import { getCachedPublicMilesSaved } from "@/lib/miles-saved-data";
import { roundLaps } from "@/lib/miles-saved";

const ALLOWED_ORIGINS = new Set([
  "https://www.yoursdurham.com",
  "https://yoursdurham.com",
]);

const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=600";

function responseHeaders(request: Request, cache: string): Headers {
  const headers = new Headers();
  headers.set("Cache-Control", cache);
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  const origin = request.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: responseHeaders(request, CACHE_CONTROL),
  });
}

/** Same shop-year miles as the homepage counter. Laps are that figure to 2 decimals. */
export async function GET(request: Request) {
  try {
    const stats = await getCachedPublicMilesSaved();
    return NextResponse.json(
      {
        miles: stats.miles,
        laps: roundLaps(stats.laps),
        year: stats.year,
      },
      { headers: responseHeaders(request, CACHE_CONTROL) },
    );
  } catch (error) {
    console.error("[GET /api/miles-saved]", error);
    return NextResponse.json(
      { error: "Miles saved unavailable" },
      { status: 500, headers: responseHeaders(request, "no-store") },
    );
  }
}
