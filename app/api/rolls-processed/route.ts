import { NextResponse } from "next/server";
import { getCachedPublicRollsProcessed } from "@/lib/rolls-processed-data";

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

/** Rolls finished in the last 30 days. No customer data. */
export async function GET(request: Request) {
  try {
    const stats = await getCachedPublicRollsProcessed();
    return NextResponse.json(stats, { headers: responseHeaders(request, CACHE_CONTROL) });
  } catch (error) {
    console.error("[GET /api/rolls-processed]", error);
    return NextResponse.json(
      { error: "Rolls processed unavailable" },
      { status: 500, headers: responseHeaders(request, "no-store") },
    );
  }
}
