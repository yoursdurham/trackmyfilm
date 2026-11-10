/**
 * Shop-wide Squarespace product ids for the free dev + high-res scan.
 * Staff only. Falls back to SQUARESPACE_REWARD_PRODUCT_IDS when this is empty.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import {
  SQUARESPACE_DISCOUNTS_API_KEY_ENV,
  parseRewardProductIds,
  REWARD_PRODUCT_IDS_ENV,
} from "@/lib/rewards";
import { configuredProductIds, savedRewardProductIds, saveRewardProductIds } from "@/lib/rewards-db";

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const saved = await savedRewardProductIds();
    return NextResponse.json({
      savedProductIds: saved,
      productIds: configuredProductIds(saved),
      envProductIds: parseRewardProductIds(process.env[REWARD_PRODUCT_IDS_ENV]),
      apiKeyConfigured: Boolean(process.env[SQUARESPACE_DISCOUNTS_API_KEY_ENV]?.trim()),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load reward settings";
    console.error("[reward settings]", message);
    return NextResponse.json({ error: "Could not load reward settings" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  let raw = "";
  try {
    const body = await req.json() as { productIds?: unknown };
    raw = typeof body.productIds === "string"
      ? body.productIds
      : Array.isArray(body.productIds)
        ? body.productIds.filter((id): id is string => typeof id === "string").join(",")
        : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const productIds = parseRewardProductIds(raw);
  if (raw.trim() && productIds.length === 0) {
    return NextResponse.json({ error: "Enter Squarespace product ids separated by commas." }, { status: 400 });
  }

  try {
    await saveRewardProductIds(productIds);
    return NextResponse.json({
      savedProductIds: productIds,
      productIds: configuredProductIds(productIds),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save reward settings";
    console.error("[reward settings]", message);
    return NextResponse.json({ error: "Could not save product ids. Run migration 032_customer_rewards.sql first." }, { status: 500 });
  }
}
