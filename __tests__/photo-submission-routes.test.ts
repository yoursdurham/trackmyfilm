import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: null as { id: string; email?: string } | null,
  customers: [] as { id: string; email: string }[],
}));

const savePhotoFiles = vi.hoisted(() => vi.fn(async (_input: {
  email: string;
  customerId: string | null;
  photos: { ext: string }[];
}) => ({ count: 1 })));
const listPhotoSubmissionsForReview = vi.hoisted(() => vi.fn(async () => [{
  id: "11111111-1111-4111-8111-111111111111",
  email: "avery.sample@example.com",
  customerId: null,
  status: "pending",
  createdAt: "2026-10-20T15:04:00.000Z",
  reviewedAt: null,
  reviewedBy: null,
  thumbnailUrl: "https://signed.example/photo",
  extension: "jpg",
}]));
const reviewPhotoSubmission = vi.hoisted(() => vi.fn(async () => ({
  id: "11111111-1111-4111-8111-111111111111",
  email: "avery.sample@example.com",
  status: "approved",
})));
const readPhotoSubmissionFile = vi.hoisted(() => vi.fn(async () => ({
  bytes: Uint8Array.from([1, 2, 3]),
  filename: "yours-photo-11111111-1111-4111-8111-111111111111.jpg",
  contentType: "image/jpeg",
})));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: authState.user } }) },
    from: () => ({
      select: async () => ({ data: authState.customers, error: null }),
    }),
  }),
}));

vi.mock("@/lib/photo-submissions-server", () => ({
  savePhotoFiles,
  listPhotoSubmissionsForReview,
  reviewPhotoSubmission,
  readPhotoSubmissionFile,
}));

import { POST as accountPost } from "@/app/api/account/photo-submissions/route";
import { GET, POST as publicPost } from "@/app/api/photo-submissions/route";
import { PATCH } from "@/app/api/photo-submissions/[id]/route";
import { GET as download } from "@/app/api/photo-submissions/[id]/download/route";
import { PHOTO_HONEYPOT_FIELD, resetPhotoSubmissionRateLimitForTests } from "@/lib/photo-submissions";
import { resetStaffAuthWarningsForTests } from "@/lib/staff-auth";

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function photo(bytes: Uint8Array, name: string, type: string) {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new File([copy], name, { type });
}

function requestFor(path: string, form: FormData, ip = "203.0.113.20") {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body: form,
    headers: { "x-forwarded-for": ip },
  });
}

describe("photo submission routes", () => {
  const originalStaff = process.env.STAFF_EMAILS;

  beforeEach(() => {
    authState.user = null;
    authState.customers = [];
    savePhotoFiles.mockClear();
    listPhotoSubmissionsForReview.mockClear();
    reviewPhotoSubmission.mockClear();
    readPhotoSubmissionFile.mockClear();
    resetPhotoSubmissionRateLimitForTests();
    resetStaffAuthWarningsForTests();
    delete process.env.STAFF_EMAILS;
  });

  afterEach(() => {
    if (originalStaff === undefined) delete process.env.STAFF_EMAILS;
    else process.env.STAFF_EMAILS = originalStaff;
  });

  it("ties an account upload to the signed-in customer and ignores a posted email", async () => {
    authState.user = { id: "user-1", email: "jane@example.com" };
    authState.customers = [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "other@example.com" },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "Jane@Example.com" },
    ];
    const form = new FormData();
    form.set("email", "someone.else@example.com");
    form.set("permission", "on");
    form.append("photos", photo(JPEG, "../../etc/passwd.jpg", "image/jpeg"));

    const response = await accountPost(requestFor("/api/account/photo-submissions", form));
    expect(response.status).toBe(200);
    expect(savePhotoFiles).toHaveBeenCalledTimes(1);
    const saved = savePhotoFiles.mock.calls[0]?.[0];
    if (!saved) throw new Error("expected a saved photo");
    expect(saved.email).toBe("jane@example.com");
    expect(saved.customerId).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(saved.photos[0]?.ext).toBe("jpg");
    expect(JSON.stringify(saved)).not.toContain("passwd");
  });

  it("refuses an account upload without a session or permission", async () => {
    const form = new FormData();
    form.set("permission", "on");
    form.append("photos", photo(JPEG, "roll.jpg", "image/jpeg"));
    const signedOut = await accountPost(requestFor("/api/account/photo-submissions", form));
    expect(signedOut.status).toBe(401);

    authState.user = { id: "user-1", email: "jane@example.com" };
    const missingPermission = new FormData();
    missingPermission.append("photos", photo(JPEG, "roll.jpg", "image/jpeg"));
    const denied = await accountPost(requestFor("/api/account/photo-submissions", missingPermission));
    expect(denied.status).toBe(400);
    expect(savePhotoFiles).not.toHaveBeenCalled();
  });

  it("rejects a renamed gif and accepts a renamed png on the public form", async () => {
    const gif = new FormData();
    gif.set("email", "avery.sample@example.com");
    gif.set("permission", "on");
    gif.append("photos", photo(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), "cat.jpg", "image/jpeg"));
    const rejected = await publicPost(requestFor("/api/photo-submissions", gif, "203.0.113.30"));
    expect(rejected.status).toBe(400);
    expect(savePhotoFiles).not.toHaveBeenCalled();

    const png = new FormData();
    png.set("email", "Avery.Sample@Example.com");
    png.set("permission", "on");
    png.append("photos", photo(PNG, "notes.jpg", "image/jpeg"));
    const accepted = await publicPost(requestFor("/api/photo-submissions", png, "203.0.113.31"));
    expect(accepted.status).toBe(200);
    const saved = savePhotoFiles.mock.calls[0]?.[0];
    if (!saved) throw new Error("expected a saved photo");
    expect(saved.email).toBe("avery.sample@example.com");
    expect(saved.customerId).toBeNull();
    expect(saved.photos[0]?.ext).toBe("png");
  });

  it("drops honeypot posts and rate limits an IP", async () => {
    const trap = new FormData();
    trap.set(PHOTO_HONEYPOT_FIELD, "https://spam.example");
    trap.set("email", "avery.sample@example.com");
    trap.set("permission", "on");
    const trapped = await publicPost(requestFor("/api/photo-submissions", trap, "203.0.113.40"));
    expect(trapped.status).toBe(200);
    expect(savePhotoFiles).not.toHaveBeenCalled();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await publicPost(requestFor("/api/photo-submissions", new FormData(), "203.0.113.41"));
      expect(response.status).toBe(400);
    }
    const limited = await publicPost(requestFor("/api/photo-submissions", new FormData(), "203.0.113.41"));
    expect(limited.status).toBe(429);
    expect(savePhotoFiles).not.toHaveBeenCalled();
  });

  it("keeps the staff list and download behind staff auth", async () => {
    const anonymous = await GET();
    expect(anonymous.status).toBe(401);

    process.env.STAFF_EMAILS = "owner@shop.test";
    authState.user = { id: "stranger", email: "stranger@example.com" };
    const forbidden = await GET();
    expect(forbidden.status).toBe(403);

    authState.user = { id: "owner", email: "owner@shop.test" };
    const listed = await GET();
    expect(listed.status).toBe(200);
    const body = await listed.json();
    expect(body.submissions[0].thumbnailUrl).toBe("https://signed.example/photo");
    expect(JSON.stringify(body)).not.toContain("storage_path");

    const updated = await PATCH(
      new Request("http://localhost/api/photo-submissions/11111111-1111-4111-8111-111111111111", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(updated.status).toBe(200);
    expect(reviewPhotoSubmission).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "approved",
      "owner@shop.test",
    );

    const file = await download(
      new Request("http://localhost/api/photo-submissions/11111111-1111-4111-8111-111111111111/download"),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(file.status).toBe(200);
    expect(file.headers.get("Content-Disposition")).toContain("attachment;");
    expect(file.headers.get("Content-Disposition")).toContain("yours-photo-");
  });
});
