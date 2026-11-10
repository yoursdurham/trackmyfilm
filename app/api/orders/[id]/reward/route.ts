/**
 * POST /api/orders/:id/reward
 * Staff apply one available reward to a single roll and void an issued code.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getOrderById } from "@/lib/db";
import { validateInStoreRoll } from "@/lib/rewards";
import { redeemCustomerReward, rewardsRepository } from "@/lib/rewards-db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  let rewardId = "";
  let rollIndex = -1;
  try {
    const body = await req.json() as { rewardId?: unknown; rollIndex?: unknown };
    rewardId = typeof body.rewardId === "string" ? body.rewardId.trim() : "";
    rollIndex = typeof body.rollIndex === "number" ? body.rollIndex : -1;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!rewardId) return NextResponse.json({ error: "Choose a reward first." }, { status: 400 });

  try {
    const order = await getOrderById(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (!order.customer_id) {
      return NextResponse.json({ error: "Link this order to a customer before applying a reward." }, { status: 400 });
    }

    const repo = rewardsRepository();
    const [reward, customerRewards] = await Promise.all([
      repo.getReward(rewardId),
      repo.listRewards(order.customer_id),
    ]);
    const rolls = order.roll_details?.length
      ? order.roll_details
      : Array.from({ length: Math.max(0, order.roll_count || 0) }, () => ({ film_type: order.film_type }));
    const usedRollIndexes = customerRewards.flatMap((entry) => (
      entry.redeemedOrder === order.id && entry.redeemedRollIndex != null ? [entry.redeemedRollIndex] : []
    ));
    const check = validateInStoreRoll({
      reward: reward ? { customerId: reward.customerId, status: reward.status } : null,
      customerId: order.customer_id,
      rollIndex,
      rolls,
      usedRollIndexes,
    });
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const redeemed = await redeemCustomerReward({ rewardId, orderId: order.id, rollIndex });
    if (!redeemed.ok) return NextResponse.json({ error: redeemed.error }, { status: 400 });
    return NextResponse.json({ success: true, rollIndex });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not apply the reward";
    console.error("[order reward]", message);
    return NextResponse.json({ error: "Could not apply the reward" }, { status: 500 });
  }
}
