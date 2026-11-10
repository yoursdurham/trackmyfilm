/**
 * POST /api/account/rewards/issue
 * The signed-in customer asks for an online code for one earned reward.
 * The reward must belong to a customer row with their verified email.
 */

import { NextResponse } from "next/server";
import { getCustomerById } from "@/lib/db";
import { issueCustomerRewardCode, rewardsRepository } from "@/lib/rewards-db";
import { createClient } from "@/lib/supabase/server";
import { emailsMatchExact } from "@/lib/validation";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email?.trim();
  if (!email) return NextResponse.json({ error: "Sign in to your account first." }, { status: 401 });

  let rewardId = "";
  try {
    const body = await req.json() as { rewardId?: unknown };
    rewardId = typeof body.rewardId === "string" ? body.rewardId.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!rewardId) return NextResponse.json({ error: "Choose a reward first." }, { status: 400 });

  try {
    const reward = await rewardsRepository().getReward(rewardId);
    if (!reward) return NextResponse.json({ error: "That reward is not on your account." }, { status: 404 });
    const customer = await getCustomerById(reward.customerId);
    if (!customer || !emailsMatchExact(customer.email, email)) {
      return NextResponse.json({ error: "That reward is not on your account." }, { status: 404 });
    }
    const issued = await issueCustomerRewardCode(rewardId);
    if (!issued.ok) return NextResponse.json({ error: issued.error }, { status: issued.status });
    return NextResponse.json({
      code: issued.code,
      validTo: issued.validTo,
      alreadyIssued: issued.alreadyIssued,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the code.";
    console.error("[account rewards]", message);
    return NextResponse.json({ error: "Could not create the code. Try again in a minute." }, { status: 500 });
  }
}
