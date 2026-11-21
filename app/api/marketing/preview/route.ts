import { NextResponse } from "next/server";
import { parseFilter } from "@/lib/marketing/audience";
import { marketingError, requireStaff } from "@/lib/marketing/http";
import { previewFilter } from "@/lib/marketing/store";

export async function POST(req: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => null) as { filter?: unknown } | null;
  const filter = parseFilter(body?.filter);
  if ("error" in filter) return NextResponse.json({ error: filter.error }, { status: 400 });
  try {
    return NextResponse.json(await previewFilter(filter));
  } catch (error) {
    return marketingError(error);
  }
}
