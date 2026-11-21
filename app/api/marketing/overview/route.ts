import { NextResponse } from "next/server";
import { nextMarketingCron, scheduleExplanation } from "@/lib/marketing/delivery";
import { marketingError, requireStaff } from "@/lib/marketing/http";
import { overview } from "@/lib/marketing/store";

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  try {
    const data = await overview();
    const next = nextMarketingCron(new Date());
    return NextResponse.json({ ...data, scheduleExplanation: scheduleExplanation(), nextCheck: next.toISOString() });
  } catch (error) {
    return marketingError(error);
  }
}
