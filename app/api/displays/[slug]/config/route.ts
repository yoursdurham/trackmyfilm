import { NextResponse } from "next/server";
import { displayBuildId, isDisplaySlug } from "@/lib/display";
import { toDisplayConfig } from "@/lib/display-config";
import { getCachedFilmMenuRevision, readKioskDisplay } from "@/lib/display-row-cache";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Display-row settings only. No film stats, film menu, departures, or calendar.
 * The kiosk calls this every couple of minutes. The row and the menu timestamp
 * come from the data cache, so a routine call does not read Supabase.
 * Cache-Control stays no-store so the browser actually reaches that cache
 * and sees a save on the next call. last_seen is not written here.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isDisplaySlug(slug)) return json({ error: "Unknown screen" }, 404);

  try {
    const [row, menuRevision] = await Promise.all([
      readKioskDisplay(slug, false),
      getCachedFilmMenuRevision(),
    ]);
    if (!row) return json({ error: "Unknown screen" }, 404);
    return json(toDisplayConfig(row, displayBuildId(), menuRevision));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GET /api/displays/:slug/config]", message);
    return json({ error: "Failed to load display" }, 500);
  }
}
