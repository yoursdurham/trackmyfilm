import { NextResponse } from "next/server";
import { parseFilter } from "@/lib/marketing/audience";
import { marketingError, requireStaff } from "@/lib/marketing/http";
import { listSegments, saveSegment } from "@/lib/marketing/store";

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ segments: await listSegments() });
  } catch (error) {
    return marketingError(error);
  }
}

export async function POST(req: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => null) as { name?: unknown; filter?: unknown } | null;
  const filter = parseFilter(body?.filter);
  if ("error" in filter) return NextResponse.json({ error: filter.error }, { status: 400 });
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "Untitled segment";
  try {
    return NextResponse.json(await saveSegment(null, name, filter, auth.email ?? auth.id));
  } catch (error) {
    return marketingError(error);
  }
}
