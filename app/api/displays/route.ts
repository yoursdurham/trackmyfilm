import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { listDisplays } from "@/lib/db";
import { toAdminDisplay } from "@/lib/display-admin";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const rows = await listDisplays();
    return json(rows.map((row) => toAdminDisplay(row)));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GET /api/displays]", message);
    return json({ error: "Failed to load displays" }, 500);
  }
}
