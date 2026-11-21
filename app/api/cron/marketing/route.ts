import { NextResponse } from "next/server";
import { runDueSends } from "@/lib/marketing/store";

function isAuthorized(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

/** Daily Hobby cron. Sends at most one small batch, and only mail that was already scheduled. */
export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runDueSends();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[marketing cron]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
