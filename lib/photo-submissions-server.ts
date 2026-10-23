/**
 * Server-only photo storage. Uses the service role and bypasses RLS.
 * Do not import this file from a client component.
 *
 * listApprovedPhotoSubmissions is the query a future public gallery or
 * studio slideshow should start from. It returns only approved rows, and
 * this module still does not publish them anywhere.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  isSafePhotoPath,
  isUuid,
  PHOTO_SUBMISSIONS_BUCKET,
  type AcceptedPhoto,
  type PhotoContentType,
  type PhotoExtension,
  type PhotoReviewItem,
  type PhotoSubmissionStatus,
} from "@/lib/photo-submissions";

const PHOTO_COLUMNS =
  "id, customer_id, email, storage_path, status, permission_given_at, created_at, reviewed_at, reviewed_by";
const SIGNED_URL_SECONDS = 60 * 60;

export type PhotoSubmissionRow = {
  id: string;
  customer_id: string | null;
  email: string;
  storage_path: string;
  status: PhotoSubmissionStatus;
  permission_given_at: string;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

let service: SupabaseClient | null = null;

function serviceClient(): SupabaseClient {
  if (service) return service;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  service = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return service;
}

function asCustomerId(value: string | null): string | null {
  if (!value || !isUuid(value)) return null;
  return value;
}

function extensionOf(path: string): PhotoReviewItem["extension"] {
  if (path.endsWith(".png")) return "png";
  if (path.endsWith(".heic")) return "heic";
  if (path.endsWith(".jpg")) return "jpg";
  return "other";
}

function contentTypeForExtension(ext: string): PhotoContentType | "application/octet-stream" {
  if (ext === "png") return "image/png";
  if (ext === "heic") return "image/heic";
  if (ext === "jpg") return "image/jpeg";
  return "application/octet-stream";
}

export async function savePhotoFiles(
  input: { email: string; customerId: string | null; photos: AcceptedPhoto[] },
  client: SupabaseClient = serviceClient(),
): Promise<{ count: number }> {
  const email = input.email.trim();
  if (!email) throw new Error("email required");
  if (input.photos.length < 1 || input.photos.length > 10) throw new Error("photo count");

  const saved: { id: string; path: string }[] = [];
  const permissionGivenAt = new Date().toISOString();
  const customerId = asCustomerId(input.customerId);

  try {
    for (const photo of input.photos) {
      const id = crypto.randomUUID();
      const storagePath = `${id}.${photo.ext}`;
      if (!isSafePhotoPath(storagePath)) throw new Error("unsafe path");
      const uploaded = await client.storage.from(PHOTO_SUBMISSIONS_BUCKET).upload(
        storagePath,
        new Blob([new Uint8Array(photo.bytes)], { type: photo.contentType }),
        { contentType: photo.contentType, upsert: false },
      );
      if (uploaded.error) throw new Error(uploaded.error.message);

      const inserted = await client
        .from("photo_submissions")
        .insert({
          id,
          customer_id: customerId,
          email,
          storage_path: storagePath,
          status: "pending",
          permission_given_at: permissionGivenAt,
        })
        .select("id")
        .single();
      if (inserted.error) {
        await client.storage.from(PHOTO_SUBMISSIONS_BUCKET).remove([storagePath]);
        throw new Error(inserted.error.message);
      }
      saved.push({ id, path: storagePath });
    }
  } catch (error) {
    if (saved.length) {
      await client.from("photo_submissions").delete().in("id", saved.map((row) => row.id));
      await client.storage.from(PHOTO_SUBMISSIONS_BUCKET).remove(saved.map((row) => row.path));
    }
    throw error;
  }

  return { count: saved.length };
}

export async function listPhotoSubmissionsForReview(
  client: SupabaseClient = serviceClient(),
): Promise<PhotoReviewItem[]> {
  const listed = await client
    .from("photo_submissions")
    .select(PHOTO_COLUMNS)
    .order("created_at", { ascending: false });
  if (listed.error) throw new Error(listed.error.message);

  const items: PhotoReviewItem[] = [];
  for (const row of (listed.data ?? []) as PhotoSubmissionRow[]) {
    if (!isSafePhotoPath(row.storage_path)) continue;
    const signed = await client.storage.from(PHOTO_SUBMISSIONS_BUCKET).createSignedUrl(row.storage_path, SIGNED_URL_SECONDS);
    items.push(toReviewItem(row, signed.data?.signedUrl ?? null));
  }
  return items;
}

/**
 * Approved photos only. Not used by a public page yet. Callers must keep
 * the bytes private (signed URLs after a staff or server check) until a
 * gallery is built on purpose.
 */
export async function listApprovedPhotoSubmissions(
  client: SupabaseClient = serviceClient(),
): Promise<PhotoSubmissionRow[]> {
  const listed = await client
    .from("photo_submissions")
    .select(PHOTO_COLUMNS)
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  if (listed.error) throw new Error(listed.error.message);
  return ((listed.data ?? []) as PhotoSubmissionRow[]).filter((row) => row.status === "approved" && isSafePhotoPath(row.storage_path));
}

export async function reviewPhotoSubmission(
  id: string,
  status: "approved" | "rejected",
  reviewedBy: string,
  client: SupabaseClient = serviceClient(),
): Promise<PhotoReviewItem | null> {
  if (!isUuid(id)) return null;
  const reviewer = reviewedBy.trim();
  if (!reviewer) return null;
  const updated = await client
    .from("photo_submissions")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewer,
    })
    .eq("id", id)
    .select(PHOTO_COLUMNS)
    .single();
  if (updated.error || !updated.data) return null;
  const row = updated.data as PhotoSubmissionRow;
  if (!isSafePhotoPath(row.storage_path)) return null;
  const signed = await client.storage.from(PHOTO_SUBMISSIONS_BUCKET).createSignedUrl(row.storage_path, SIGNED_URL_SECONDS);
  return toReviewItem(row, signed.data?.signedUrl ?? null);
}

export async function readPhotoSubmissionFile(
  id: string,
  client: SupabaseClient = serviceClient(),
): Promise<{ bytes: Uint8Array; filename: string; contentType: string } | null> {
  if (!isUuid(id)) return null;
  const found = await client
    .from("photo_submissions")
    .select("id, storage_path")
    .eq("id", id)
    .single();
  if (found.error || !found.data) return null;
  const storagePath = String((found.data as { storage_path?: string }).storage_path ?? "");
  if (!isSafePhotoPath(storagePath)) return null;
  const downloaded = await client.storage.from(PHOTO_SUBMISSIONS_BUCKET).download(storagePath);
  if (downloaded.error || !downloaded.data) return null;
  const ext = storagePath.slice(storagePath.lastIndexOf(".") + 1) as PhotoExtension;
  return {
    bytes: new Uint8Array(await downloaded.data.arrayBuffer()),
    filename: `yours-photo-${id}.${ext}`,
    contentType: contentTypeForExtension(ext),
  };
}

function toReviewItem(row: PhotoSubmissionRow, thumbnailUrl: string | null): PhotoReviewItem {
  return {
    id: row.id,
    email: row.email,
    customerId: row.customer_id,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    thumbnailUrl,
    extension: extensionOf(row.storage_path),
  };
}
