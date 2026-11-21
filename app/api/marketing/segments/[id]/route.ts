import { NextResponse } from "next/server";
import { parseFilter } from "@/lib/marketing/audience";
import { marketingError, requireStaff } from "@/lib/marketing/http";
import { archiveSegment, saveSegment } from "@/lib/marketing/store";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  const body = await req.json().catch(() => null) as { name?: unknown; filter?: unknown; archive?: unknown } | null;
  try {
    if (body?.archive === true) {
      await archiveSegment(id, auth.email ?? auth.id);
      return NextResponse.json({ ok: true });
    }
    const filter = parseFilter(body?.filter);
    if ("error" in filter) return NextResponse.json({ error: filter.error }, { status: 400 });
    const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "Untitled segment";
    return NextResponse.json(await saveSegment(id, name, filter, auth.email ?? auth.id));
  } catch (error) {
    return marketingError(error);
  }
}
