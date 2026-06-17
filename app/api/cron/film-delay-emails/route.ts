/**
 * GET /api/cron/film-delay-emails
 * Daily cron: send film_delay emails for orders at the lab 8+ days without movement.
 * Protected by CRON_SECRET (Vercel sends Authorization: Bearer <CRON_SECRET>).
 */

import { NextResponse } from "next/server";
import { processFilmDelayEmails } from "@/lib/film-delay-emails";

function isAuthorized(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[film-delay] CRON_SECRET is not configured");
    return false;
  }
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processFilmDelayEmails();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[film-delay] Cron job failed:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
