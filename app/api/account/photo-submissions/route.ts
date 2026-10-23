import { NextResponse } from "next/server";
import {
  acceptedPhotos,
  formPermissionGranted,
  PHOTO_PERMISSION_ERROR,
  PHOTO_SAVE_ERROR,
  PHOTO_SIGN_IN_ERROR,
  PHOTO_SUBMITTED_MESSAGE,
} from "@/lib/photo-submissions";
import { savePhotoFiles } from "@/lib/photo-submissions-server";
import { createClient } from "@/lib/supabase/server";
import { emailsMatchExact } from "@/lib/validation";

export const maxDuration = 60;

/**
 * Signed-in customers only. The email and customer id come from the session,
 * never from the form. The customer lookup uses the user-scoped client so
 * RLS applies. The service role is used only inside savePhotoFiles.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email?.trim() ?? "";
  if (!user || !email) {
    return NextResponse.json({ error: PHOTO_SIGN_IN_ERROR }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: PHOTO_PERMISSION_ERROR }, { status: 400 });
  }
  if (!formPermissionGranted(form)) {
    return NextResponse.json({ error: PHOTO_PERMISSION_ERROR }, { status: 400 });
  }
  const photos = await acceptedPhotos(form);
  if ("error" in photos) {
    return NextResponse.json({ error: photos.error }, { status: 400 });
  }

  try {
    await savePhotoFiles({
      email,
      customerId: await customerIdForSession(supabase, email),
      photos: photos.photos,
    });
  } catch (error) {
    console.error("[photo-submissions]", error instanceof Error ? error.message : "save failed");
    return NextResponse.json({ error: PHOTO_SAVE_ERROR }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: PHOTO_SUBMITTED_MESSAGE });
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
