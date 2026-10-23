import { NextResponse } from "next/server";
import {
  jsonPermissionGranted,
  optionalSubmissionDetails,
  PHOTO_PERMISSION_ERROR,
  PHOTO_SAVE_ERROR,
  PHOTO_SIGN_IN_ERROR,
  slotPhotosFromMetadata,
} from "@/lib/photo-submissions";
import { createPhotoUploadSlots, deleteOrphanPhotoObjects, PhotoUploadError } from "@/lib/photo-submissions-server";
import { createClient } from "@/lib/supabase/server";
import { emailsMatchExact } from "@/lib/validation";

export const maxDuration = 60;

/**
 * Signed-in customers only. The email and customer id come from the session,
 * never from the JSON body. The customer lookup uses the user-scoped client
 * so RLS applies. Signed upload tokens are created with the service role.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email?.trim() ?? "";
  if (!user || !email) {
    return NextResponse.json({ error: PHOTO_SIGN_IN_ERROR }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!jsonPermissionGranted(body)) {
    return NextResponse.json({ error: PHOTO_PERMISSION_ERROR }, { status: 400 });
  }
  const photos = slotPhotosFromMetadata(body && typeof body === "object" ? (body as { photos?: unknown }).photos : null);
  if ("error" in photos) {
    return NextResponse.json({ error: photos.error }, { status: 400 });
  }
  const details = optionalSubmissionDetails(body);
  if ("error" in details) {
    return NextResponse.json({ error: details.error }, { status: 400 });
  }

  try {
    const slots = await createPhotoUploadSlots({
      email,
      customerId: await customerIdForSession(supabase, email),
      photos: photos.photos,
      instagramHandle: details.instagramHandle,
      filmStock: details.filmStock,
    });
    await deleteOrphanPhotoObjects().catch((error) => {
      console.error("[photo-submissions]", error instanceof Error ? error.message : "cleanup failed");
    });
    return NextResponse.json({ uploads: slots.uploads, claim: slots.claim });
  } catch (error) {
    const message = error instanceof PhotoUploadError ? error.message : PHOTO_SAVE_ERROR;
    const status = error instanceof PhotoUploadError ? error.status : 500;
    if (!(error instanceof PhotoUploadError)) {
      console.error("[photo-submissions]", error instanceof Error ? error.message : "slot failed");
    }
    return NextResponse.json({ error: message }, { status });
  }
}

async function customerIdForSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string,
): Promise<string | null> {
  const { data, error } = await supabase.from("customers").select("id, email");
  if (error || !data) return null;
  const match = data.find((row) => {
    const id = (row as { id?: unknown }).id;
    const rowEmail = (row as { email?: unknown }).email;
    return typeof id === "string" && typeof rowEmail === "string" && emailsMatchExact(rowEmail, email);
  }) as { id: string } | undefined;
  return match?.id ?? null;
}
