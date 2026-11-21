import { NextResponse } from "next/server";
import { marketingError, requireStaff } from "@/lib/marketing/http";
import { parseBlocks } from "@/lib/marketing/messages";
import { saveTemplate } from "@/lib/marketing/store";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  const body = await req.json().catch(() => null) as { name?: unknown; subject?: unknown; previewText?: unknown; blocks?: unknown; plainText?: unknown } | null;
  const blocks = parseBlocks(body?.blocks ?? []);
  if ("error" in blocks) return NextResponse.json({ error: blocks.error }, { status: 400 });
  try {
    const saved = await saveTemplate(id, {
      name: typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "Untitled template",
      subject: typeof body?.subject === "string" ? body.subject : "",
      previewText: typeof body?.previewText === "string" ? body.previewText : "",
      blocks,
      plainText: typeof body?.plainText === "string" ? body.plainText : "",
    }, auth.email ?? auth.id);
    return NextResponse.json(saved);
  } catch (error) {
    return marketingError(error);
  }
}
