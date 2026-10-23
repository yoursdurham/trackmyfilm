import { NextResponse } from "next/server";
import { PHOTO_SAVE_ERROR, PHOTO_SUBMITTED_MESSAGE, PHOTO_UPLOAD_EXPIRED } from "@/lib/photo-submissions";
import { deleteOrphanPhotoObjects, finalizePhotoUploads, PhotoUploadError } from "@/lib/photo-submissions-server";

export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

/** Marks reserved photos pending after Storage has the objects. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const claim = body && typeof body === "object" && typeof (body as { claim?: unknown }).claim === "string"
    ? (body as { claim: string }).claim
    : "";
  if (!claim) {
    return NextResponse.json({ error: PHOTO_UPLOAD_EXPIRED }, { status: 400, headers: noStore });
  }

  try {
    await finalizePhotoUploads(claim);
    await deleteOrphanPhotoObjects().catch((error) => {
      console.error("[photo-submissions]", error instanceof Error ? error.message : "cleanup failed");
    });
    return NextResponse.json({ ok: true, message: PHOTO_SUBMITTED_MESSAGE }, { headers: noStore });
  } catch (error) {
    const message = error instanceof PhotoUploadError ? error.message : PHOTO_SAVE_ERROR;
    const status = error instanceof PhotoUploadError ? error.status : 500;
    if (!(error instanceof PhotoUploadError)) {
      console.error("[photo-submissions]", error instanceof Error ? error.message : "finalize failed");
    }
    return NextResponse.json({ error: message }, { status, headers: noStore });
  }
}
