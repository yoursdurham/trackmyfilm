import { NextResponse } from "next/server";
import { getDisplayBySlug, touchDisplayHeartbeat } from "@/lib/db";
import { displayBuildId, isDisplaySlug, parseHeartbeatClient } from "@/lib/display";
import { toDisplayConfig } from "@/lib/display-config";
import { heartbeatDueFromSeen, heartbeatWriteDue, rememberHeartbeatWrite } from "@/lib/display-heartbeat";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Display-row settings only. No film stats, film menu, departures, or calendar.
 * The kiosk calls this about once a minute. last_seen is written here, at
 * most every few minutes, including while the heavy payload stays cached.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isDisplaySlug(slug)) return json({ error: "Unknown screen" }, 404);

  const preview = new URL(req.url).searchParams.get("preview") === "1";

  try {
    const row = await getDisplayBySlug(slug);
    if (!row) return json({ error: "Unknown screen" }, 404);

    if (!preview && heartbeatDueFromSeen(row.last_seen) && heartbeatWriteDue(slug)) {
      try {
        const client = parseHeartbeatClient(
          { appVersion: "phase1" },
          req.headers.get("user-agent"),
        );
        const wrote = await touchDisplayHeartbeat(slug, client);
        if (wrote) rememberHeartbeatWrite(slug);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[GET /api/displays/:slug/config] heartbeat", message);
      }
    }

    return json(toDisplayConfig(row, displayBuildId()));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GET /api/displays/:slug/config]", message);
    return json({ error: "Failed to load display" }, 500);
  }
}
