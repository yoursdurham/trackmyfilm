import { NextResponse } from "next/server";
import { marketingError, requireStaff } from "@/lib/marketing/http";
import { aiDraftingStatus } from "@/lib/marketing/metrics";
import { getSettings, saveSettings } from "@/lib/marketing/store";
import { SHOP_NAME } from "@/lib/marketing/types";

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({
      settings: await getSettings(),
      ai: aiDraftingStatus(),
      fromEmail: process.env.RESEND_FROM_EMAIL ?? "",
      shopName: SHOP_NAME,
    });
  } catch (error) {
    return marketingError(error);
  }
}

export async function POST(req: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const address = typeof body?.physicalAddress === "string" ? body.physicalAddress.trim() : "";
  if (address.length < 8 || address.length > 200) {
    return NextResponse.json({ error: "Enter the shop's street address." }, { status: 400 });
  }
  const capCount = body?.frequencyCapCount;
  const capDays = body?.frequencyCapDays;
  const windowDays = body?.attributionWindowDays;
  if (typeof capCount !== "number" || capCount < 0 || capCount > 30) {
    return NextResponse.json({ error: "The frequency cap count must be from 0 to 30. Zero holds every marketing send." }, { status: 400 });
  }
  if (typeof capDays !== "number" || capDays < 1 || capDays > 365) {
    return NextResponse.json({ error: "The frequency window must be from 1 to 365 days." }, { status: 400 });
  }
  if (typeof windowDays !== "number" || windowDays < 1 || windowDays > 90) {
    return NextResponse.json({ error: "The attribution window must be from 1 to 90 days." }, { status: 400 });
  }
  try {
    const settings = await saveSettings({
      physicalAddress: address,
      fromName: SHOP_NAME,
      replyTo: typeof body?.replyTo === "string" && body.replyTo.trim() ? body.replyTo.trim() : null,
      frequencyCapCount: capCount,
      frequencyCapDays: capDays,
      attributionWindowDays: windowDays,
    }, auth.email ?? auth.id);
    return NextResponse.json({ settings });
  } catch (error) {
    return marketingError(error);
  }
}
