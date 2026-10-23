/**
 * Server-only photo storage. Uses the service role and bypasses RLS.
 * Do not import this file from a client component.
 *
 * listApprovedPhotoSubmissions is the query a future public gallery or
 * studio slideshow should start from. It returns only approved rows, and
 * this module still does not publish them anywhere.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  detectPhotoFile,
  isSafePhotoPath,
  isUuid,
  MAX_PHOTO_BYTES,
  mimeAgreesWithPhoto,
  PHOTO_CLAIM_TTL_MS,
  PHOTO_ORPHAN_GRACE_MS,
  PHOTO_SAVE_ERROR,
  PHOTO_TOO_LARGE_ERROR,
  PHOTO_TYPE_ERROR,
  PHOTO_UPLOAD_EXPIRED,
  PHOTO_UPLOAD_INCOMPLETE,
  PHOTO_SUBMISSIONS_BUCKET,
  type PhotoContentType,
  type PhotoExtension,
  type PhotoReviewItem,
  type PhotoSubmissionStatus,
  type SlotPhoto,
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

export class PhotoUploadError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type PhotoUploadClaim = {
  v: 1;
  email: string;
  customerId: string | null;
  permissionGivenAt: string;
  exp: number;
  photos: { path: string; ext: PhotoExtension; contentType: PhotoContentType; size: number }[];
};

export type PhotoUploadSlot = {
  path: string;
  token: string;
  contentType: PhotoContentType;
};

function claimSecret(secret?: string): string {
  const value = secret ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("Supabase env vars not configured");
  return value;
}

export function signPhotoClaim(claim: PhotoUploadClaim, secret?: string): string {
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  const signature = createHmac("sha256", claimSecret(secret)).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readPhotoClaim(token: string, secret?: string, now = Date.now()): PhotoUploadClaim | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", claimSecret(secret)).update(payload).digest("base64url");
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
  try {
    const claim = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PhotoUploadClaim;
    if (claim.v !== 1 || claim.exp <= now) return null;
    if (typeof claim.email !== "string" || !claim.email.trim()) return null;
    if (claim.customerId !== null && (typeof claim.customerId !== "string" || !isUuid(claim.customerId))) return null;
    if (typeof claim.permissionGivenAt !== "string" || !claim.permissionGivenAt) return null;
    if (!Array.isArray(claim.photos) || claim.photos.length < 1 || claim.photos.length > 10) return null;
    for (const photo of claim.photos) {
      if (!photo || !isSafePhotoPath(photo.path)) return null;
      if (!photo.path.endsWith(`.${photo.ext}`)) return null;
      if (photo.ext === "jpg" && photo.contentType !== "image/jpeg") return null;
      if (photo.ext === "png" && photo.contentType !== "image/png") return null;
      if (photo.ext === "heic" && photo.contentType !== "image/heic") return null;
      if (typeof photo.size !== "number" || photo.size <= 0 || photo.size > MAX_PHOTO_BYTES) return null;
    }
    return { ...claim, email: claim.email.trim(), customerId: asCustomerId(claim.customerId) };
  } catch {
    return null;
  }
}

/**
 * Reserves generated paths and signed upload tokens. Rows are not inserted
 * until finalizePhotoUploads has seen the objects. The claim binds the path
 * to this email so a later request cannot submit someone else's file.
 */
export async function createPhotoUploadSlots(
  input: { email: string; customerId: string | null; photos: SlotPhoto[] },
  client: SupabaseClient = serviceClient(),
  secret?: string,
  now = Date.now(),
): Promise<{ uploads: PhotoUploadSlot[]; claim: string }> {
  const email = input.email.trim();
  if (!email) throw new PhotoUploadError(PHOTO_SAVE_ERROR, 500);
  if (input.photos.length < 1 || input.photos.length > 10) throw new PhotoUploadError(PHOTO_SAVE_ERROR, 500);

  const reserved: PhotoUploadClaim["photos"] = [];
  const uploads: PhotoUploadSlot[] = [];
  for (const photo of input.photos) {
    const path = `${crypto.randomUUID()}.${photo.ext}`;
    if (!isSafePhotoPath(path)) throw new PhotoUploadError(PHOTO_SAVE_ERROR, 500);
    const signed = await client.storage.from(PHOTO_SUBMISSIONS_BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (signed.error || !signed.data?.token) throw new PhotoUploadError(PHOTO_SAVE_ERROR, 500);
    reserved.push({ path, ext: photo.ext, contentType: photo.contentType, size: photo.size });
    uploads.push({ path, token: signed.data.token, contentType: photo.contentType });
  }

  const claim = signPhotoClaim({
    v: 1,
    email,
    customerId: asCustomerId(input.customerId),
    permissionGivenAt: new Date(now).toISOString(),
    exp: now + PHOTO_CLAIM_TTL_MS,
    photos: reserved,
  }, secret);
  return { uploads, claim };
}

/**
 * Inserts pending rows only after each object exists and its size and bytes
 * match a photo. A bad object is removed. Retrying the same claim is safe.
 */
export async function finalizePhotoUploads(
  token: string,
  options: { mustEmail?: string } = {},
  client: SupabaseClient = serviceClient(),
  secret?: string,
  now = Date.now(),
): Promise<{ count: number }> {
  const claim = readPhotoClaim(token, secret, now);
  if (!claim) throw new PhotoUploadError(PHOTO_UPLOAD_EXPIRED, 400);
  if (options.mustEmail && claim.email.toLowerCase() !== options.mustEmail.trim().toLowerCase()) {
    throw new PhotoUploadError(PHOTO_UPLOAD_EXPIRED, 400);
  }

  const pending: PhotoUploadClaim["photos"] = [];
  const alreadyStored = new Set<string>();
  for (const photo of claim.photos) {
    const existing = await client
      .from("photo_submissions")
      .select("id")
      .eq("storage_path", photo.path)
      .maybeSingle();
    if (!existing.error && existing.data) {
      alreadyStored.add(photo.path);
      continue;
    }
    const verified = await verifyStoredPhoto(client, photo);
    if (!verified.ok) {
      const unused = claim.photos.map((item) => item.path).filter((path) => !alreadyStored.has(path));
      await client.storage.from(PHOTO_SUBMISSIONS_BUCKET).remove(unused);
      throw new PhotoUploadError(verified.error, 400);
    }
    pending.push(photo);
  }

  for (const photo of pending) {
    const id = photo.path.slice(0, photo.path.lastIndexOf("."));
    const inserted = await client
      .from("photo_submissions")
      .insert({
        id,
        customer_id: claim.customerId,
        email: claim.email,
        storage_path: photo.path,
        status: "pending",
        permission_given_at: claim.permissionGivenAt,
      })
      .select("id")
      .single();
    if (inserted.error) throw new PhotoUploadError(PHOTO_SAVE_ERROR, 500);
  }

  return { count: claim.photos.length };
}

async function verifyStoredPhoto(
  client: SupabaseClient,
  photo: PhotoUploadClaim["photos"][number],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const info = await client.storage.from(PHOTO_SUBMISSIONS_BUCKET).info(photo.path);
  if (info.error || !info.data) return { ok: false, error: PHOTO_UPLOAD_INCOMPLETE };
  const infoRecord = info.data as { size?: number; contentType?: string; content_type?: string; metadata?: { mimetype?: string } };
  const infoSize = typeof infoRecord.size === "number" ? infoRecord.size : null;
  if (infoSize !== null && infoSize > MAX_PHOTO_BYTES) return { ok: false, error: PHOTO_TOO_LARGE_ERROR };
  if (infoSize !== null && infoSize <= 0) return { ok: false, error: PHOTO_TYPE_ERROR };
  const mime = infoRecord.contentType || infoRecord.content_type || infoRecord.metadata?.mimetype || "";
  if (!mimeAgreesWithPhoto(mime, photo.ext)) return { ok: false, error: PHOTO_TYPE_ERROR };

  const downloaded = await client.storage.from(PHOTO_SUBMISSIONS_BUCKET).download(photo.path);
  if (downloaded.error || !downloaded.data) return { ok: false, error: PHOTO_UPLOAD_INCOMPLETE };
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  if (bytes.byteLength > MAX_PHOTO_BYTES) return { ok: false, error: PHOTO_TOO_LARGE_ERROR };
  const detected = detectPhotoFile(bytes);
  if (!detected.ok || detected.ext !== photo.ext) return { ok: false, error: PHOTO_TYPE_ERROR };
  return { ok: true };
}

/** Deletes stored files that never became a row. Fresh uploads are left alone. */
export async function deleteOrphanPhotoObjects(
  client: SupabaseClient = serviceClient(),
  now = Date.now(),
): Promise<{ removed: string[] }> {
  const listed = await client.storage.from(PHOTO_SUBMISSIONS_BUCKET).list("", { limit: 1000 });
  if (listed.error || !listed.data) return { removed: [] };
  const stale = listed.data.filter((file) => {
    if (!file?.name || !isSafePhotoPath(file.name)) return false;
    const created = file.created_at ? Date.parse(file.created_at) : Number.NaN;
    return Number.isFinite(created) && now - created >= PHOTO_ORPHAN_GRACE_MS;
  });
  if (!stale.length) return { removed: [] };
  const names = stale.map((file) => file.name);
  const existing = await client.from("photo_submissions").select("storage_path").in("storage_path", names);
  if (existing.error) return { removed: [] };
  const kept = new Set((existing.data ?? []).map((row) => String((row as { storage_path?: string }).storage_path ?? "")));
  const orphans = names.filter((name) => !kept.has(name));
  if (!orphans.length) return { removed: [] };
  const removed = await client.storage.from(PHOTO_SUBMISSIONS_BUCKET).remove(orphans);
  if (removed.error) return { removed: [] };
  return { removed: orphans };
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
