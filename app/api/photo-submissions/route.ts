import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import {
  acceptedPhotos,
  clientIp,
  formEmail,
  formHoneypotFilled,
  formPermissionGranted,
  PHOTO_EMAIL_ERROR,
  PHOTO_PERMISSION_ERROR,
  PHOTO_RATE_LIMIT_MESSAGE,
  PHOTO_SAVE_ERROR,
  PHOTO_SUBMITTED_MESSAGE,
  photoSubmissionIsRateLimited,
} from "@/lib/photo-submissions";
import { listPhotoSubmissionsForReview, savePhotoFiles } from "@/lib/photo-submissions-server";
import { isValidEmail } from "@/lib/validation";

export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

/** Public homepage uploads. customer_id stays null. Email comes from the form. */
export async function POST(request: Request) {
  if (photoSubmissionIsRateLimited(clientIp(request))) {
    return NextResponse.json({ error: PHOTO_RATE_LIMIT_MESSAGE }, { status: 429, headers: noStore });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: PHOTO_PERMISSION_ERROR }, { status: 400, headers: noStore });
  }

  // Same success shape as a real save, so a bot cannot tell the trap worked.
  if (formHoneypotFilled(form)) {
    return NextResponse.json({ ok: true, message: PHOTO_SUBMITTED_MESSAGE }, { headers: noStore });
  }

  const email = formEmail(form);
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: PHOTO_EMAIL_ERROR }, { status: 400, headers: noStore });
  }
  if (!formPermissionGranted(form)) {
    return NextResponse.json({ error: PHOTO_PERMISSION_ERROR }, { status: 400, headers: noStore });
  }

  const photos = await acceptedPhotos(form);
  if ("error" in photos) {
    return NextResponse.json({ error: photos.error }, { status: 400, headers: noStore });
  }

  try {
    await savePhotoFiles({ email, customerId: null, photos: photos.photos });
  } catch (error) {
    console.error("[photo-submissions]", error instanceof Error ? error.message : "save failed");
    return NextResponse.json({ error: PHOTO_SAVE_ERROR }, { status: 500, headers: noStore });
  }

  return NextResponse.json({ ok: true, message: PHOTO_SUBMITTED_MESSAGE }, { headers: noStore });
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
