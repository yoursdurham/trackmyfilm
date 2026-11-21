import { NextResponse } from "next/server";
import { marketingError, requireStaff } from "@/lib/marketing/http";
import { parseBlocks } from "@/lib/marketing/messages";
import { listCampaigns, saveCampaign } from "@/lib/marketing/store";
import { parseFilter } from "@/lib/marketing/audience";

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ campaigns: await listCampaigns() });
  } catch (error) {
    return marketingError(error);
  }
}

export async function POST(req: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const blocks = parseBlocks(body?.blocks ?? []);
  if ("error" in blocks) return NextResponse.json({ error: blocks.error }, { status: 400 });
  let adHocFilter = null;
  if (body?.adHocFilter) {
    const parsed = parseFilter(body.adHocFilter);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    adHocFilter = parsed;
  }
  try {
    const saved = await saveCampaign(null, { ...body, blocks, adHocFilter }, auth.email ?? auth.id);
    return NextResponse.json(saved);
  } catch (error) {
    return marketingError(error);
  }
}
