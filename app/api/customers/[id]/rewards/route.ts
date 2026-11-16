/**
 * GET  /api/customers/:id/rewards — balance, codes, and history for staff.
 * POST /api/customers/:id/rewards — manual roll adjustment with a reason.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getCustomerById } from "@/lib/db";
import { validateAdjustment } from "@/lib/rewards";
import { adjustCustomerRewardRolls, loadCustomerRewardView } from "@/lib/rewards-db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const customer = await getCustomerById(id);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  try {
    const view = await loadCustomerRewardView(id);
    return NextResponse.json(view);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load rewards";
    console.error("[customer rewards]", message);
    return NextResponse.json({ error: "Could not load rewards" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const customer = await getCustomerById(id);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  let body: { rolls?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const adjustment = validateAdjustment(body.rolls, body.reason);
  if (!adjustment.ok) return NextResponse.json({ error: adjustment.error }, { status: 400 });

  try {
    await adjustCustomerRewardRolls(id, adjustment.rolls, adjustment.reason);
    const view = await loadCustomerRewardView(id);
    return NextResponse.json(view);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not adjust rewards";
    console.error("[customer rewards] adjust", message);
    return NextResponse.json({ error: "Could not adjust rewards. The rewards tables may not be in the database yet." }, { status: 500 });
  }
}
