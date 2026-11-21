import { NextResponse } from "next/server";
import { marketingError, requireStaff } from "@/lib/marketing/http";
import { listAutomations } from "@/lib/marketing/store";
import { scheduleExplanation } from "@/lib/marketing/delivery";

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ automations: await listAutomations(), scheduleExplanation: scheduleExplanation() });
  } catch (error) {
    return marketingError(error);
  }
}
