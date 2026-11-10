/**
 * GET /api/rewards/board
 * Open rewards and in-store redemptions for the order list. Staff only.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { loadRewardBoard } from "@/lib/rewards-db";

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await loadRewardBoard());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load rewards";
    console.error("[reward board]", message);
    return NextResponse.json({ error: "Could not load rewards" }, { status: 500 });
  }
}
