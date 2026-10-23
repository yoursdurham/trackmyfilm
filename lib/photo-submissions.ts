/**
 * Shared rules for customer photo submissions.
 * Safe to import from client components. The service-role client lives in
 * lib/photo-submissions-server.ts and must stay on the server.
 *
 * A later public gallery or studio slideshow should show only rows whose
 * status is "approved" (see approvedPhotoSubmissions). Pending and rejected
 * photos stay private.
 */

import { normalizeEmail } from "@/lib/validation";

export const PHOTO_SUBMISSIONS_BUCKET = "photo-submissions";
export const PHOTO_REVIEW_PATH = "/dashboard/photos";
export const MAX_PHOTO_FILES = 10;
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const PHOTO_PERMISSION_LABEL =
  "I give Yours, Durham permission to show these photos in the store and online";
export const PHOTO_HONEYPOT_FIELD = "company_website";
export const PHOTO_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const PHOTO_RATE_LIMIT_MAX = 5;
export const PHOTO_RATE_LIMIT_MESSAGE = "Please wait a few minutes and try again.";
export const PHOTO_SUBMITTED_MESSAGE = "Thanks. We'll look these over before anything goes up.";
export const PHOTO_SAVE_ERROR = "We couldn't save those photos. Try again.";
export const PHOTO_SIGN_IN_ERROR = "Please sign in to send photos.";
export const PHOTO_TOO_MANY_ERROR = "You can send up to 10 photos at a time.";
export const PHOTO_TOO_LARGE_ERROR = "Each photo must be 15 MB or smaller.";
export const PHOTO_TYPE_ERROR = "Use a JPG, PNG, or HEIC photo.";
export const PHOTO_REQUIRED_ERROR = "Choose at least one photo.";
export const PHOTO_PERMISSION_ERROR = "Permission is required.";
export const PHOTO_EMAIL_ERROR = "Enter an email address.";

export const PHOTO_STATUSES = ["pending", "approved", "rejected"] as const;
export type PhotoSubmissionStatus = (typeof PHOTO_STATUSES)[number];
export type PhotoExtension = "jpg" | "png" | "heic";
export type PhotoContentType = "image/jpeg" | "image/png" | "image/heic";

export type AcceptedPhoto = {
  bytes: Uint8Array;
  ext: PhotoExtension;
  contentType: PhotoContentType;
};

export type PhotoReviewItem = {
  id: string;
  email: string;
  customerId: string | null;
  status: PhotoSubmissionStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  thumbnailUrl: string | null;
  extension: PhotoExtension | "other";
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_STORAGE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|heic)$/i;
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "heif", "mif1", "msf1"]);

type RateLimitEntry = { count: number; resetAt: number };
const rateLimit = new Map<string, RateLimitEntry>();

/** Dev-only fake review page. Production never treats preview=1 as access. */
export function isPhotoReviewPreview(
  pathname: string,
  preview: string | null,
  nodeEnv = process.env.NODE_ENV,
): boolean {
  return nodeEnv !== "production" && preview === "1" && pathname === PHOTO_REVIEW_PATH;
}

export function previewPhotoReviewItems(): PhotoReviewItem[] {
  return [
    {
      id: "11111111-1111-4111-8111-111111111111",
      email: "avery.sample@example.com",
      customerId: null,
      status: "pending",
      createdAt: "2026-10-20T15:04:00.000Z",
      reviewedAt: null,
      reviewedBy: null,
      thumbnailUrl: "/logo.png",
      extension: "jpg",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      email: "avery.sample@example.com",
      customerId: null,
      status: "pending",
      createdAt: "2026-10-18T15:04:00.000Z",
      reviewedAt: null,
      reviewedBy: null,
      thumbnailUrl: "/icon.png",
      extension: "png",
    },
  ];
}

/** Rows a future public gallery is allowed to consider. */
export function approvedPhotoSubmissions<T extends { status: string }>(rows: T[]): T[] {
  return rows.filter((row) => row.status === "approved");
}

export function isReviewStatus(value: unknown): value is "approved" | "rejected" {
  return value === "approved" || value === "rejected";
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isSafePhotoPath(path: string): boolean {
  return SAFE_STORAGE_PATH.test(path);
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** True when this attempt must be rejected. Records the attempt either way. */
export function photoSubmissionIsRateLimited(ip: string, now = Date.now()): boolean {
  const key = ip.trim() || "unknown";
  const existing = rateLimit.get(key);
  if (!existing || existing.resetAt <= now) {
    rateLimit.set(key, { count: 1, resetAt: now + PHOTO_RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (existing.count >= PHOTO_RATE_LIMIT_MAX) return true;
  existing.count += 1;
  rateLimit.set(key, existing);
  return false;
}

export function resetPhotoSubmissionRateLimitForTests() {
  rateLimit.clear();
}

export function formHoneypotFilled(form: FormData): boolean {
  const value = form.get(PHOTO_HONEYPOT_FIELD);
  if (typeof value === "string") return value.trim() !== "";
  if (value instanceof File) return value.size > 0 || value.name.trim() !== "";
  return false;
}

export function formPermissionGranted(form: FormData): boolean {
  const value = form.get("permission");
  return value === "on" || value === "true";
}

export function formEmail(form: FormData): string {
  const value = form.get("email");
  return typeof value === "string" ? normalizeEmail(value) : "";
}

export function photoByteSizeAllowed(size: number): boolean {
  return size > 0 && size <= MAX_PHOTO_BYTES;
}

export function detectPhotoFile(bytes: Uint8Array):
  | { ok: true; ext: PhotoExtension; contentType: PhotoContentType }
  | { ok: false; error: string } {
  if (bytes.byteLength > MAX_PHOTO_BYTES) return { ok: false, error: PHOTO_TOO_LARGE_ERROR };
  if (isJpeg(bytes)) return { ok: true, ext: "jpg", contentType: "image/jpeg" };
  if (isPng(bytes)) return { ok: true, ext: "png", contentType: "image/png" };
  if (isHeic(bytes)) return { ok: true, ext: "heic", contentType: "image/heic" };
  return { ok: false, error: PHOTO_TYPE_ERROR };
}

export async function acceptedPhotos(form: FormData): Promise<{ photos: AcceptedPhoto[] } | { error: string }> {
  const files = form.getAll("photos").filter((entry): entry is File => {
    return entry instanceof File && (entry.size > 0 || entry.name.trim() !== "");
  });
  if (files.length === 0) return { error: PHOTO_REQUIRED_ERROR };
  if (files.length > MAX_PHOTO_FILES) return { error: PHOTO_TOO_MANY_ERROR };

  const photos: AcceptedPhoto[] = [];
  for (const file of files) {
    if (file.size > MAX_PHOTO_BYTES) return { error: PHOTO_TOO_LARGE_ERROR };
    if (file.size <= 0) return { error: PHOTO_TYPE_ERROR };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = detectPhotoFile(bytes);
    if (!detected.ok) return { error: detected.error };
    photos.push({ bytes, ext: detected.ext, contentType: detected.contentType });
  }
  return { photos };
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a;
}

function isHeic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  if (ascii(bytes, 4, 8) !== "ftyp") return false;
  return HEIC_BRANDS.has(ascii(bytes, 8, 12).toLowerCase());
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let text = "";
  for (let index = start; index < end; index += 1) text += String.fromCharCode(bytes[index] ?? 0);
  return text;
}
