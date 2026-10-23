import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach } from "vitest";
import {
  MAX_PHOTO_BYTES,
  PHOTO_TOO_LARGE_ERROR,
  PHOTO_TOO_MANY_ERROR,
  PHOTO_TYPE_ERROR,
  acceptedPhotos,
  approvedPhotoSubmissions,
  slotPhotosFromMetadata,
  detectPhotoFile,
  isPhotoReviewPreview,
  isSafePhotoPath,
  photoByteSizeAllowed,
  photoSubmissionIsRateLimited,
  resetPhotoSubmissionRateLimitForTests,
} from "@/lib/photo-submissions";

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HEIC = Uint8Array.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const AVIF = Uint8Array.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);

function file(bytes: Uint8Array, name: string, type: string) {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new File([copy], name, { type });
}

describe("photo file checks", () => {
  it("accepts jpeg, png, and heic bytes and ignores the filename", () => {
    expect(detectPhotoFile(JPEG)).toMatchObject({ ok: true, ext: "jpg", contentType: "image/jpeg" });
    expect(detectPhotoFile(PNG)).toMatchObject({ ok: true, ext: "png" });
    expect(detectPhotoFile(HEIC)).toMatchObject({ ok: true, ext: "heic", contentType: "image/heic" });
    expect(detectPhotoFile(GIF).ok).toBe(false);
    expect(detectPhotoFile(AVIF).ok).toBe(false);
  });

  it("caps each photo at 15 MB and a batch at 10", async () => {
    expect(photoByteSizeAllowed(MAX_PHOTO_BYTES)).toBe(true);
    expect(photoByteSizeAllowed(MAX_PHOTO_BYTES + 1)).toBe(false);
    expect(photoByteSizeAllowed(0)).toBe(false);

    const tooBig = new Uint8Array(MAX_PHOTO_BYTES + 1);
    tooBig.set(JPEG);
    expect(detectPhotoFile(tooBig)).toEqual({ ok: false, error: PHOTO_TOO_LARGE_ERROR });

    const form = new FormData();
    for (let index = 0; index < 11; index += 1) form.append("photos", file(JPEG, `roll-${index}.jpg`, "image/jpeg"));
    expect(await acceptedPhotos(form)).toEqual({ error: PHOTO_TOO_MANY_ERROR });
  });

  it("stores a png that was renamed to .jpg as png, and rejects a gif", async () => {
    const renamed = new FormData();
    renamed.append("photos", file(PNG, "../../etc/passwd.jpg", "image/jpeg"));
    const accepted = await acceptedPhotos(renamed);
    expect("photos" in accepted).toBe(true);
    if ("photos" in accepted) {
      expect(accepted.photos[0]?.ext).toBe("png");
      expect(accepted.photos[0]?.contentType).toBe("image/png");
    }

    const gif = new FormData();
    gif.append("photos", file(GIF, "cat.jpg", "image/jpeg"));
    expect(await acceptedPhotos(gif)).toEqual({ error: PHOTO_TYPE_ERROR });
  });

  it("accepts declared jpeg, png, and heic sizes and rejects a gif or a huge file", () => {
    expect(slotPhotosFromMetadata([{ size: 12, contentType: "image/jpeg" }])).toEqual({
      photos: [{ size: 12, ext: "jpg", contentType: "image/jpeg" }],
    });
    expect(slotPhotosFromMetadata([{ size: 12, contentType: "image/heif" }])).toMatchObject({
      photos: [{ ext: "heic" }],
    });
    expect(slotPhotosFromMetadata([{ size: 12, contentType: "image/gif" }])).toEqual({ error: PHOTO_TYPE_ERROR });
    expect(slotPhotosFromMetadata([{ size: MAX_PHOTO_BYTES + 1, contentType: "image/png" }])).toEqual({
      error: PHOTO_TOO_LARGE_ERROR,
    });
  });

  it("rejects traversal paths and keeps only approved rows for a future gallery", () => {
    expect(isSafePhotoPath("11111111-1111-4111-8111-111111111111.jpg")).toBe(true);
    expect(isSafePhotoPath("../secret.jpg")).toBe(false);
    expect(isSafePhotoPath("folder/photo.jpg")).toBe(false);
    const rows = [
      { status: "pending" },
      { status: "approved" },
      { status: "rejected" },
    ];
    expect(approvedPhotoSubmissions(rows)).toEqual([{ status: "approved" }]);
  });
});

describe("public upload rate limit", () => {
  beforeEach(() => resetPhotoSubmissionRateLimitForTests());

  it("allows five attempts per IP and then asks them to wait", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(photoSubmissionIsRateLimited("203.0.113.4")).toBe(false);
    }
    expect(photoSubmissionIsRateLimited("203.0.113.4")).toBe(true);
    expect(photoSubmissionIsRateLimited("203.0.113.5")).toBe(false);
  });
});

describe("photo review preview", () => {
  it("stays off in production and off for other staff pages", () => {
    expect(isPhotoReviewPreview("/dashboard/photos", "1", "production")).toBe(false);
    expect(isPhotoReviewPreview("/dashboard", "1", "development")).toBe(false);
    expect(isPhotoReviewPreview("/dashboard/photos", "1", "development")).toBe(true);
  });
});

describe("photo submission migration", () => {
  const sql = readFileSync("supabase/migrations/024_photo_submissions.sql", "utf8");

  it("creates the private table and bucket the owner runs by hand", () => {
    expect(sql).toContain("create table if not exists public.photo_submissions");
    for (const column of [
      "id uuid primary key",
      "customer_id uuid",
      "email text not null",
      "storage_path text not null",
      "permission_given_at timestamptz not null",
      "created_at timestamptz not null",
      "reviewed_at timestamptz",
      "reviewed_by text",
    ]) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain("'pending', 'approved', 'rejected'");
    expect(sql).toContain("references public.customers (id) on delete set null");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("revoke all on table public.photo_submissions from public, anon, authenticated");
    expect(sql).toContain("grant all on table public.photo_submissions to service_role");
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toContain("'photo-submissions'");
    expect(sql).toContain("false");
    expect(sql).toContain("15728640");
    expect(sql).toContain("Public bucket: off");
  });
});
