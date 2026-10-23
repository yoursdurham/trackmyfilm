import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { isUuid } from "@/lib/photo-submissions";
import { readPhotoSubmissionFile } from "@/lib/photo-submissions-server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "That photo was not found." }, { status: 404 });
  }

  try {
    const file = await readPhotoSubmissionFile(id);
    if (!file) {
      return NextResponse.json({ error: "That photo was not found." }, { status: 404 });
    }
    const body = new ArrayBuffer(file.bytes.byteLength);
    new Uint8Array(body).set(file.bytes);
    return new NextResponse(body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[photo-submissions]", error instanceof Error ? error.message : "download failed");
    return NextResponse.json({ error: "That photo could not be downloaded." }, { status: 500 });
  }
}
