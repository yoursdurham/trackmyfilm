import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import {
  clientIp,
  jsonEmail,
  jsonHoneypotFilled,
  jsonPermissionGranted,
  optionalSubmissionDetails,
  PHOTO_EMAIL_ERROR,
  PHOTO_PERMISSION_ERROR,
  PHOTO_RATE_LIMIT_MESSAGE,
  PHOTO_SAVE_ERROR,
  PHOTO_SUBMITTED_MESSAGE,
  photoSubmissionIsRateLimited,
  slotPhotosFromMetadata,
} from "@/lib/photo-submissions";
import {
  createPhotoUploadSlots,
  deleteOrphanPhotoObjects,
  listPhotoSubmissionsForReview,
  PhotoUploadError,
} from "@/lib/photo-submissions-server";
import { isValidEmail } from "@/lib/validation";

export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

/**
 * Public homepage: reserve signed upload URLs. The photo bytes go straight
 * to Storage. customer_id stays null. Email comes from this JSON body.
 */
export async function POST(request: Request) {
  if (photoSubmissionIsRateLimited(clientIp(request))) {
    return NextResponse.json({ error: PHOTO_RATE_LIMIT_MESSAGE }, { status: 429, headers: noStore });
  }

  const body = await request.json().catch(() => null);
  if (jsonHoneypotFilled(body)) {
    return NextResponse.json({ ok: true, message: PHOTO_SUBMITTED_MESSAGE }, { headers: noStore });
  }

  const email = jsonEmail(body);
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: PHOTO_EMAIL_ERROR }, { status: 400, headers: noStore });
  }
  if (!jsonPermissionGranted(body)) {
    return NextResponse.json({ error: PHOTO_PERMISSION_ERROR }, { status: 400, headers: noStore });
  }
  const photos = slotPhotosFromMetadata(body && typeof body === "object" ? (body as { photos?: unknown }).photos : null);
  if ("error" in photos) {
    return NextResponse.json({ error: photos.error }, { status: 400, headers: noStore });
  }
  const details = optionalSubmissionDetails(body);
  if ("error" in details) {
    return NextResponse.json({ error: details.error }, { status: 400, headers: noStore });
  }

  try {
    const slots = await createPhotoUploadSlots({
      email,
      customerId: null,
      photos: photos.photos,
      instagramHandle: details.instagramHandle,
      filmStock: details.filmStock,
    });
    await deleteOrphanPhotoObjects().catch((error) => {
      console.error("[photo-submissions]", error instanceof Error ? error.message : "cleanup failed");
    });
    return NextResponse.json({ uploads: slots.uploads, claim: slots.claim }, { headers: noStore });
  } catch (error) {
    const message = error instanceof PhotoUploadError ? error.message : PHOTO_SAVE_ERROR;
    const status = error instanceof PhotoUploadError ? error.status : 500;
    if (!(error instanceof PhotoUploadError)) {
      console.error("[photo-submissions]", error instanceof Error ? error.message : "slot failed");
    }
    return NextResponse.json({ error: message }, { status, headers: noStore });
  }
}

/** Staff review list. Thumbnail URLs are signed. storage_path stays on the server. */
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const submissions = await listPhotoSubmissionsForReview();
    return NextResponse.json({ submissions }, { headers: noStore });
  } catch (error) {
    console.error("[photo-submissions]", error instanceof Error ? error.message : "list failed");
    return NextResponse.json({ error: "Photos couldn't be loaded." }, { status: 500, headers: noStore });
  }
}
