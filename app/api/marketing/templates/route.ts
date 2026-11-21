import { NextResponse } from "next/server";
import { marketingError, requireStaff } from "@/lib/marketing/http";
import { parseBlocks } from "@/lib/marketing/messages";
import { listTemplates, saveTemplate } from "@/lib/marketing/store";

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ templates: await listTemplates() });
  } catch (error) {
    return marketingError(error);
  }
}

export async function POST(req: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => null) as { name?: unknown; subject?: unknown; previewText?: unknown; blocks?: unknown; plainText?: unknown } | null;
  const blocks = parseBlocks(body?.blocks ?? []);
  if ("error" in blocks) return NextResponse.json({ error: blocks.error }, { status: 400 });
  try {
    const saved = await saveTemplate(null, {
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
