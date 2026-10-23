import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: null as { id: string; email?: string } | null,
  customers: [] as { id: string; email: string }[],
}));

const createPhotoUploadSlots = vi.hoisted(() => vi.fn(async (_input: {
  email: string;
  customerId: string | null;
  photos: { ext: string; size?: number }[];
}) => ({
  uploads: [{ path: "11111111-1111-4111-8111-111111111111.jpg", token: "upload-token", contentType: "image/jpeg" as const }],
  claim: "signed-claim",
})));
const finalizePhotoUploads = vi.hoisted(() => vi.fn(async () => ({ count: 1 })));
const deleteOrphanPhotoObjects = vi.hoisted(() => vi.fn(async () => ({ removed: [] as string[] })));
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
  createPhotoUploadSlots,
  finalizePhotoUploads,
  deleteOrphanPhotoObjects,
  listPhotoSubmissionsForReview,
  reviewPhotoSubmission,
  readPhotoSubmissionFile,
  PhotoUploadError: class PhotoUploadError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

import { POST as accountPost } from "@/app/api/account/photo-submissions/route";
import { POST as accountFinalize } from "@/app/api/account/photo-submissions/finalize/route";
import { GET, POST as publicPost } from "@/app/api/photo-submissions/route";
import { POST as publicFinalize } from "@/app/api/photo-submissions/finalize/route";
import { PATCH } from "@/app/api/photo-submissions/[id]/route";
import { GET as download } from "@/app/api/photo-submissions/[id]/download/route";
import { PHOTO_HONEYPOT_FIELD, resetPhotoSubmissionRateLimitForTests } from "@/lib/photo-submissions";
import { resetStaffAuthWarningsForTests } from "@/lib/staff-auth";

function postJson(path: string, body: unknown, ip = "203.0.113.20") {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("photo submission routes", () => {
  const originalStaff = process.env.STAFF_EMAILS;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    authState.user = null;
    authState.customers = [];
    createPhotoUploadSlots.mockClear();
    finalizePhotoUploads.mockClear();
    deleteOrphanPhotoObjects.mockClear();
    listPhotoSubmissionsForReview.mockClear();
    reviewPhotoSubmission.mockClear();
    readPhotoSubmissionFile.mockClear();
    resetPhotoSubmissionRateLimitForTests();
    resetStaffAuthWarningsForTests();
    delete process.env.STAFF_EMAILS;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret-value";
  });

  afterEach(() => {
    if (originalStaff === undefined) delete process.env.STAFF_EMAILS;
    else process.env.STAFF_EMAILS = originalStaff;
    if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
  });

  it("ties an account slot to the signed-in customer and ignores a posted email", async () => {
    authState.user = { id: "user-1", email: "jane@example.com" };
    authState.customers = [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "other@example.com" },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "Jane@Example.com" },
    ];
    const response = await accountPost(postJson("/api/account/photo-submissions", {
      email: "someone.else@example.com",
      permission: true,
      photos: [{ size: 4, contentType: "image/jpeg", name: "../../etc/passwd.jpg" }],
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.uploads[0].token).toBe("upload-token");
    expect(JSON.stringify(body)).not.toContain("service-role-secret-value");
    expect(JSON.stringify(body)).not.toContain("passwd");
    const saved = createPhotoUploadSlots.mock.calls[0]?.[0] as {
      email: string;
      customerId: string | null;
      photos: { ext: string }[];
    };
    expect(saved.email).toBe("jane@example.com");
    expect(saved.customerId).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(saved.photos[0]?.ext).toBe("jpg");
    expect(deleteOrphanPhotoObjects).toHaveBeenCalled();
  });

  it("refuses an account slot without a session or permission", async () => {
    const signedOut = await accountPost(postJson("/api/account/photo-submissions", {
      permission: true,
      photos: [{ size: 4, contentType: "image/jpeg" }],
    }));
    expect(signedOut.status).toBe(401);

    authState.user = { id: "user-1", email: "jane@example.com" };
    const denied = await accountPost(postJson("/api/account/photo-submissions", {
      photos: [{ size: 4, contentType: "image/jpeg" }],
    }));
    expect(denied.status).toBe(400);
    expect(createPhotoUploadSlots).not.toHaveBeenCalled();

    authState.user = null;
    const finalize = await accountFinalize(postJson("/api/account/photo-submissions/finalize", { claim: "signed-claim" }));
    expect(finalize.status).toBe(401);
    expect(finalizePhotoUploads).not.toHaveBeenCalled();
  });

  it("rejects a gif declaration and reserves a png without taking the file bytes", async () => {
    const gif = await publicPost(postJson("/api/photo-submissions", {
      email: "avery.sample@example.com",
      permission: true,
      photos: [{ size: 6, contentType: "image/gif" }],
    }, "203.0.113.30"));
    expect(gif.status).toBe(400);
    expect(createPhotoUploadSlots).not.toHaveBeenCalled();

    const png = await publicPost(postJson("/api/photo-submissions", {
      email: "Avery.Sample@Example.com",
      permission: true,
      photos: [{ size: 8, contentType: "image/png" }],
    }, "203.0.113.31"));
    expect(png.status).toBe(200);
    const saved = createPhotoUploadSlots.mock.calls[0]?.[0] as {
      email: string;
      customerId: string | null;
      photos: { ext: string; size: number }[];
    };
    expect(saved.email).toBe("avery.sample@example.com");
    expect(saved.customerId).toBeNull();
    expect(saved.photos[0]).toMatchObject({ ext: "png", size: 8 });
  });

  it("drops honeypot posts and rate limits an IP", async () => {
    const trapped = await publicPost(postJson("/api/photo-submissions", {
      [PHOTO_HONEYPOT_FIELD]: "https://spam.example",
      email: "avery.sample@example.com",
      permission: true,
      photos: [{ size: 4, contentType: "image/jpeg" }],
    }, "203.0.113.40"));
    expect(trapped.status).toBe(200);
    const trapBody = await trapped.json();
    expect(trapBody.uploads).toBeUndefined();
    expect(createPhotoUploadSlots).not.toHaveBeenCalled();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await publicPost(postJson("/api/photo-submissions", {}, "203.0.113.41"));
      expect(response.status).toBe(400);
    }
    const limited = await publicPost(postJson("/api/photo-submissions", {}, "203.0.113.41"));
    expect(limited.status).toBe(429);
    expect(createPhotoUploadSlots).not.toHaveBeenCalled();
  });

  it("finalizes a public claim without reading a photo body", async () => {
    const response = await publicFinalize(postJson("/api/photo-submissions/finalize", { claim: "signed-claim" }));
    expect(response.status).toBe(200);
    expect(finalizePhotoUploads).toHaveBeenCalledWith("signed-claim");
    expect(deleteOrphanPhotoObjects).toHaveBeenCalled();
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
