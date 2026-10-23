import { NextResponse } from "next/server";
import {
  PHOTO_SAVE_ERROR,
  PHOTO_SIGN_IN_ERROR,
  PHOTO_SUBMITTED_MESSAGE,
  PHOTO_UPLOAD_EXPIRED,
} from "@/lib/photo-submissions";
import { deleteOrphanPhotoObjects, finalizePhotoUploads, PhotoUploadError } from "@/lib/photo-submissions-server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/** The signed-in email must match the claim created for that session. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email?.trim() ?? "";
  if (!user || !email) {
    return NextResponse.json({ error: PHOTO_SIGN_IN_ERROR }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const claim = body && typeof body === "object" && typeof (body as { claim?: unknown }).claim === "string"
    ? (body as { claim: string }).claim
    : "";
  if (!claim) {
    return NextResponse.json({ error: PHOTO_UPLOAD_EXPIRED }, { status: 400 });
  }

  try {
    await finalizePhotoUploads(claim, { mustEmail: email });
    await deleteOrphanPhotoObjects().catch((error) => {
      console.error("[photo-submissions]", error instanceof Error ? error.message : "cleanup failed");
    });
    return NextResponse.json({ ok: true, message: PHOTO_SUBMITTED_MESSAGE });
  } catch (error) {
    const message = error instanceof PhotoUploadError ? error.message : PHOTO_SAVE_ERROR;
    const status = error instanceof PhotoUploadError ? error.status : 500;
    if (!(error instanceof PhotoUploadError)) {
      console.error("[photo-submissions]", error instanceof Error ? error.message : "finalize failed");
    }
    return NextResponse.json({ error: message }, { status });
  }
}
