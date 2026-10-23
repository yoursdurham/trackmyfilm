import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AcceptedPhoto, PhotoSubmissionStatus } from "@/lib/photo-submissions";
import { MAX_PHOTO_BYTES } from "@/lib/photo-submissions";
import {
  createPhotoUploadSlots,
  deleteOrphanPhotoObjects,
  finalizePhotoUploads,
  listApprovedPhotoSubmissions,
  listPhotoSubmissionsForReview,
  PhotoUploadError,
  readPhotoClaim,
  readPhotoSubmissionFile,
  signPhotoClaim,
  type PhotoSubmissionRow,
  type PhotoUploadClaim,
} from "@/lib/photo-submissions-server";

const JPEG: AcceptedPhoto = {
  bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
  ext: "jpg",
  contentType: "image/jpeg",
};

function row(status: PhotoSubmissionStatus, id: string): PhotoSubmissionRow {
  return {
    id,
    customer_id: null,
    email: "avery.sample@example.com",
    storage_path: `${id}.jpg`,
    status,
    permission_given_at: "2026-10-20T15:00:00.000Z",
    created_at: "2026-10-20T15:04:00.000Z",
    reviewed_at: null,
    reviewed_by: null,
    instagram_handle: "avery.sample",
    film_stock: "Kodak Portra 400",
  };
}

function fakeClient(rows: PhotoSubmissionRow[] = []) {
  const state = {
    uploads: [] as { bucket: string; path: string; contentType: string }[],
    signed: [] as { bucket: string; path: string; upsert: boolean }[],
    removed: [] as string[],
    inserts: [] as Record<string, unknown>[],
    deletedIds: [] as string[],
    eqs: [] as [string, string][],
    failOnUpload: 0,
    uploadCount: 0,
    objects: new Map<string, { bytes: Uint8Array; contentType: string; size?: number }>(),
    files: [] as { name: string; created_at: string | null }[],
  };

  const client = {
    from() {
      return {
        insert(record: Record<string, unknown>) {
          state.inserts.push(record);
          return { select: () => ({ single: async () => ({ data: { id: record.id }, error: null }) }) };
        },
        select() {
          return {
            order: async () => ({ data: rows, error: null }),
            eq(column: string, value: string) {
              state.eqs.push([column, value]);
              const matched = rows.filter((item) => String((item as unknown as Record<string, unknown>)[column] ?? "") === value);
              return {
                order: async () => ({ data: matched, error: null }),
                single: async () => ({
                  data: matched[0] ?? null,
                  error: matched[0] ? null : { message: "missing" },
                }),
                maybeSingle: async () => ({ data: matched[0] ?? null, error: null }),
              };
            },
            in: async (column: string, values: string[]) => ({
              data: rows.filter((item) => values.includes(String((item as unknown as Record<string, unknown>)[column] ?? ""))),
              error: null,
            }),
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq() {
              return {
                select() {
                  return {
                    single: async () => ({
                      data: rows[0] ? { ...rows[0], ...patch } : null,
                      error: rows[0] ? null : { message: "missing" },
                    }),
                  };
                },
              };
            },
          };
        },
        delete() {
          return {
            in: async (_column: string, ids: string[]) => {
              state.deletedIds = ids;
              return { error: null };
            },
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        return {
          upload: async (path: string, _body: Uint8Array, options: { contentType: string }) => {
            state.uploadCount += 1;
            if (state.failOnUpload && state.uploadCount === state.failOnUpload) {
              return { error: { message: "disk full" } };
            }
            state.uploads.push({ bucket, path, contentType: options.contentType });
            return { error: null };
          },
          remove: async (paths: string[]) => {
            state.removed.push(...paths);
            return { error: null };
          },
          createSignedUrl: async (path: string, expires: number) => ({
            data: { signedUrl: `https://signed.example/${path}?exp=${expires}` },
            error: null,
          }),
          createSignedUploadUrl: async (path: string, options: { upsert: boolean }) => {
            state.signed.push({ bucket, path, upsert: options.upsert });
            return { data: { signedUrl: `https://upload.example/${path}`, token: `token-${path}`, path }, error: null };
          },
          info: async (path: string) => {
            const object = state.objects.get(path);
            if (!object) return { data: null, error: { message: "missing" } };
            return { data: { size: object.size ?? object.bytes.byteLength, contentType: object.contentType }, error: null };
          },
          list: async () => ({ data: state.files, error: null }),
          download: async (path: string) => {
            const object = state.objects.get(path);
            const bytes = object?.bytes ?? Uint8Array.from([9, 9]);
            const copy = new ArrayBuffer(bytes.byteLength);
            new Uint8Array(copy).set(bytes);
            return { data: new Blob([copy]), error: null };
          },
        };
      },
    },
  };

  return { state, client: client as unknown as SupabaseClient };
}

describe("photo submission storage", () => {
  let fixture: ReturnType<typeof fakeClient>;

  beforeEach(() => {
    fixture = fakeClient();
  });

  it("reserves a signed upload URL and does not store the file or a row yet", async () => {
    const secret = "super-secret-service-role";
    const slots = await createPhotoUploadSlots({
      email: "jane@example.com",
      customerId: "not-a-uuid",
      photos: [{ ...JPEG, size: JPEG.bytes.byteLength }],
    }, fixture.client, secret);

    expect(fixture.state.uploads).toHaveLength(0);
    expect(fixture.state.inserts).toHaveLength(0);
    expect(fixture.state.signed).toHaveLength(1);
    expect(fixture.state.signed[0]?.bucket).toBe("photo-submissions");
    expect(fixture.state.signed[0]?.upsert).toBe(false);
    expect(fixture.state.signed[0]?.path).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/,
    );
    expect(slots.uploads[0]?.token).toBe(`token-${slots.uploads[0]?.path}`);
    expect(JSON.stringify(slots)).not.toContain(secret);
  });

  it("inserts a pending row only after the stored object matches", async () => {
    const secret = "super-secret-service-role";
    const slots = await createPhotoUploadSlots({
      email: "jane@example.com",
      customerId: null,
      photos: [{ ...JPEG, size: JPEG.bytes.byteLength }],
    }, fixture.client, secret);
    const path = slots.uploads[0]?.path ?? "";
    fixture.state.objects.set(path, { bytes: JPEG.bytes, contentType: "image/jpeg" });

    const saved = await finalizePhotoUploads(slots.claim, {}, fixture.client, secret);
    expect(saved.count).toBe(1);
    expect(fixture.state.inserts[0]).toMatchObject({
      email: "jane@example.com",
      customer_id: null,
      status: "pending",
      storage_path: path,
    });
  });

  it("removes an object whose bytes are not the reserved photo type", async () => {
    const secret = "super-secret-service-role";
    const slots = await createPhotoUploadSlots({
      email: "jane@example.com",
      customerId: null,
      photos: [{ ...JPEG, size: 6 }],
    }, fixture.client, secret);
    const path = slots.uploads[0]?.path ?? "";
    fixture.state.objects.set(path, {
      bytes: Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
      contentType: "image/jpeg",
    });

    await expect(finalizePhotoUploads(slots.claim, {}, fixture.client, secret)).rejects.toBeInstanceOf(PhotoUploadError);
    expect(fixture.state.inserts).toHaveLength(0);
    expect(fixture.state.removed).toContain(path);
  });

  it("rejects an object over 15 MB before keeping it", async () => {
    const secret = "super-secret-service-role";
    const slots = await createPhotoUploadSlots({
      email: "jane@example.com",
      customerId: null,
      photos: [{ ...JPEG, size: JPEG.bytes.byteLength }],
    }, fixture.client, secret);
    const path = slots.uploads[0]?.path ?? "";
    fixture.state.objects.set(path, { bytes: JPEG.bytes, contentType: "image/jpeg", size: MAX_PHOTO_BYTES + 1 });

    await expect(finalizePhotoUploads(slots.claim, {}, fixture.client, secret)).rejects.toMatchObject({ status: 400 });
    expect(fixture.state.inserts).toHaveLength(0);
    expect(fixture.state.removed).toContain(path);
  });

  it("deletes stale objects that never became a row", async () => {
    const kept = "22222222-2222-4222-8222-222222222222";
    const orphan = "11111111-1111-4111-8111-111111111111";
    const fresh = "33333333-3333-4333-8333-333333333333";
    fixture = fakeClient([row("pending", kept)]);
    fixture.state.files = [
      { name: `${orphan}.jpg`, created_at: "2020-01-01T00:00:00.000Z" },
      { name: `${kept}.jpg`, created_at: "2020-01-01T00:00:00.000Z" },
      { name: `${fresh}.jpg`, created_at: new Date().toISOString() },
    ];

    const cleaned = await deleteOrphanPhotoObjects(fixture.client, Date.now());
    expect(cleaned.removed).toEqual([`${orphan}.jpg`]);
  });

  it("signs thumbnails without handing the storage path to the review page", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    fixture = fakeClient([row("pending", id)]);
    const items = await listPhotoSubmissionsForReview(fixture.client);
    expect(items[0]?.thumbnailUrl).toContain("https://signed.example/");
    expect(items[0]).not.toHaveProperty("storage_path");
    expect(JSON.stringify(items)).not.toContain("storage_path");
    expect(items[0]?.instagramHandle).toBe("avery.sample");
    expect(items[0]?.filmStock).toBe("Kodak Portra 400");
  });

  it("lists approved rows only for a future gallery", async () => {
    const approved = row("approved", "11111111-1111-4111-8111-111111111111");
    const pending = row("pending", "22222222-2222-4222-8222-222222222222");
    fixture = fakeClient([approved, pending]);
    const rows = await listApprovedPhotoSubmissions(fixture.client);
    expect(fixture.state.eqs).toContainEqual(["status", "approved"]);
    expect(rows.map((item) => item.status)).toEqual(["approved"]);
  });

  it("stores the same instagram handle and film stock on every photo in the batch", async () => {
    const secret = "super-secret-service-role";
    const slots = await createPhotoUploadSlots({
      email: "jane@example.com",
      customerId: null,
      photos: [
        { ext: "jpg", contentType: "image/jpeg", size: JPEG.bytes.byteLength },
        { ext: "jpg", contentType: "image/jpeg", size: JPEG.bytes.byteLength },
      ],
      instagramHandle: "@Jane.Doe",
      filmStock: "  Kodak Pheonix 200  ",
    }, fixture.client, secret);
    for (const upload of slots.uploads) {
      fixture.state.objects.set(upload.path, { bytes: JPEG.bytes, contentType: "image/jpeg" });
    }

    const saved = await finalizePhotoUploads(slots.claim, {}, fixture.client, secret);
    expect(saved.count).toBe(2);
    expect(fixture.state.inserts).toHaveLength(2);
    expect(fixture.state.inserts.map((item) => item.instagram_handle)).toEqual(["Jane.Doe", "Jane.Doe"]);
    expect(fixture.state.inserts.map((item) => item.film_stock)).toEqual(["Kodak Phoenix 200", "Kodak Phoenix 200"]);
  });

  it("rejects a signed claim whose instagram handle is not allowed", () => {
    const secret = "super-secret-service-role";
    const claim: PhotoUploadClaim = {
      v: 1,
      email: "jane@example.com",
      customerId: null,
      permissionGivenAt: "2026-10-20T15:00:00.000Z",
      exp: Date.now() + 60_000,
      instagramHandle: "not a handle",
      filmStock: null,
      photos: [{
        path: "11111111-1111-4111-8111-111111111111.jpg",
        ext: "jpg",
        contentType: "image/jpeg",
        size: 4,
      }],
    };
    expect(readPhotoClaim(signPhotoClaim(claim, secret), secret)).toBeNull();

    const omitted = { ...claim, instagramHandle: "jane.doe" };
    delete (omitted as { instagramHandle?: string }).instagramHandle;
    delete (omitted as { filmStock?: string | null }).filmStock;
    const read = readPhotoClaim(signPhotoClaim(omitted as PhotoUploadClaim, secret), secret);
    expect(read?.instagramHandle).toBeNull();
    expect(read?.filmStock).toBeNull();
  });

  it("downloads by id, not by a caller-supplied path", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    fixture = fakeClient([row("pending", id)]);
    const file = await readPhotoSubmissionFile(id, fixture.client);
    expect(file?.filename).toBe(`yours-photo-${id}.jpg`);
    expect(file?.bytes.byteLength).toBe(2);
    expect(await readPhotoSubmissionFile("../secret", fixture.client)).toBeNull();
  });
});
