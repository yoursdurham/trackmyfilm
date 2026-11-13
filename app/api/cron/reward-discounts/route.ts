/**
 * GET /api/cron/reward-discounts
 * Daily cron (08:30 UTC). Hobby plans only allow one run per day.
 * Lists TMF reward discounts, marks used codes redeemed, deletes spent
 * and expired discounts, and returns an unused expired code to earned.
 * Does not import Squarespace orders. Protected by CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { discountFailureMessage, runRewardDiscountCleanup } from "@/lib/rewards-db";

function isAuthorized(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[rewards] CRON_SECRET is not configured");
    return false;
  }
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runRewardDiscountCleanup();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = discountFailureMessage(error);
    console.error("[rewards] Discount cleanup failed:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
