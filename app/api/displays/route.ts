import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { listDisplays } from "@/lib/db";
import { toAdminDisplay, type DisplaysAdminResponse } from "@/lib/display-admin";
import { getCachedStudioAgenda } from "@/lib/studio-calendar-cache";
import type { StudioCalendarStatus } from "@/lib/studio-calendar-config";
import type { StudioDisplayInput } from "@/lib/display";

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
    let studio: StudioDisplayInput | null = null;
    let calendar: StudioCalendarStatus = {
      configured: false,
      connected: false,
      bookingsLeftToday: null,
      nextBookingStart: null,
    };
    try {
      const agenda = await getCachedStudioAgenda(new Date());
      studio = agenda.input;
      calendar = agenda.status;
    } catch {
      console.error("[studio-calendar] unavailable");
    }
    const body: DisplaysAdminResponse = {
      displays: rows.map((row) => toAdminDisplay(
        row,
        Date.now(),
        row.show_studio_bookings !== false ? { studio } : undefined,
      )),
      calendar,
    };
    return json(body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GET /api/displays]", message);
    return json({ error: "Failed to load displays" }, 500);
  }
}
