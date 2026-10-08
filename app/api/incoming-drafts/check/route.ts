/**
 * POST /api/incoming-drafts/check
 * Logged-in staff only. Pulls Squarespace orders from the last 7 days and
 * creates Pending Intake drafts for film-processing purchases placed in that
 * window that are not already in the system. The Orders API filters by
 * modified date; import also requires createdOn within the same 7 days.
 * Does not send email, does not create film orders, and does not change
 * drafts or film orders that are already stored.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import {
  createIncomingDraft,
  getIncomingDraftByExternalId,
  getIncomingDraftByOrderNumber,
  orderNumberExists,
} from "@/lib/db";
import { importSquarespaceOrders } from "@/lib/squarespace-import";
import {
  fetchRecentSquarespaceOrders,
  missingSquarespaceApiKeySummary,
  SQUARESPACE_API_KEY_ENV,
  SQUARESPACE_LOOKBACK_DAYS,
} from "@/lib/squarespace-orders";

export async function POST() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const apiKey = process.env[SQUARESPACE_API_KEY_ENV]?.trim();
  if (!apiKey) {
    return NextResponse.json(missingSquarespaceApiKeySummary());
  }

  try {
    const now = new Date();
    const fetched = await fetchRecentSquarespaceOrders(fetch, apiKey, now);
    const summary = await importSquarespaceOrders(fetched.orders, {
      orderNumberExists,
      getIncomingDraftByOrderNumber,
      getIncomingDraftByExternalId,
      createIncomingDraft,
    }, now);
    summary.truncated = fetched.truncated;
    if (!fetched.ok) {
      summary.errors.push({ message: fetched.error });
    } else if (fetched.truncated) {
      summary.errors.push({
        message: `Stopped after the newest Squarespace pages. Older orders in the ${SQUARESPACE_LOOKBACK_DAYS}-day lookback window were not checked.`,
      });
    }
    return NextResponse.json(summary);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[POST /api/incoming-drafts/check]", message);
    return NextResponse.json({ error: "Failed to check Squarespace" }, { status: 500 });
  }
}
