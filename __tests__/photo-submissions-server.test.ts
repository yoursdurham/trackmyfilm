import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AcceptedPhoto, PhotoSubmissionStatus } from "@/lib/photo-submissions";
import {
  listApprovedPhotoSubmissions,
  listPhotoSubmissionsForReview,
  readPhotoSubmissionFile,
  savePhotoFiles,
  type PhotoSubmissionRow,
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
  };
}

function fakeClient(rows: PhotoSubmissionRow[] = []) {
  const state = {
    uploads: [] as { bucket: string; path: string; contentType: string }[],
    removed: [] as string[],
    inserts: [] as Record<string, unknown>[],
    deletedIds: [] as string[],
    eqs: [] as [string, string][],
    failOnUpload: 0,
    uploadCount: 0,
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
              const matched = rows.filter((item) => item[column as "status"] === value);
              return {
                order: async () => ({ data: matched, error: null }),
                single: async () => ({
                  data: matched[0] ?? null,
                  error: matched[0] ? null : { message: "missing" },
                }),
              };
            },
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
          download: async () => ({ data: new Blob([Uint8Array.from([9, 9])]), error: null }),
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

  it("uploads into the private bucket under a generated name", async () => {
    const saved = await savePhotoFiles({
      email: "jane@example.com",
      customerId: "not-a-uuid",
      photos: [JPEG],
    }, fixture.client);

    expect(saved.count).toBe(1);
    expect(fixture.state.uploads).toHaveLength(1);
    expect(fixture.state.uploads[0]?.bucket).toBe("photo-submissions");
    expect(fixture.state.uploads[0]?.path).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/,
    );
    expect(fixture.state.uploads[0]?.contentType).toBe("image/jpeg");
    expect(fixture.state.inserts[0]).toMatchObject({
      email: "jane@example.com",
      customer_id: null,
      status: "pending",
      storage_path: fixture.state.uploads[0]?.path,
    });
    expect(JSON.stringify(fixture.state.inserts[0])).not.toContain("passwd");
  });

  it("removes earlier photos when a later upload fails", async () => {
    fixture.state.failOnUpload = 2;
    await expect(savePhotoFiles({
      email: "jane@example.com",
      customerId: null,
      photos: [JPEG, { ...JPEG }],
    }, fixture.client)).rejects.toThrow(/disk full/);
    expect(fixture.state.deletedIds).toHaveLength(1);
    expect(fixture.state.removed).toHaveLength(1);
  });

  it("signs thumbnails without handing the storage path to the review page", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    fixture = fakeClient([row("pending", id)]);
    const items = await listPhotoSubmissionsForReview(fixture.client);
    expect(items[0]?.thumbnailUrl).toContain("https://signed.example/");
    expect(items[0]).not.toHaveProperty("storage_path");
    expect(JSON.stringify(items)).not.toContain("storage_path");
  });

  it("lists approved rows only for a future gallery", async () => {
    const approved = row("approved", "11111111-1111-4111-8111-111111111111");
    const pending = row("pending", "22222222-2222-4222-8222-222222222222");
    fixture = fakeClient([approved, pending]);
    const rows = await listApprovedPhotoSubmissions(fixture.client);
    expect(fixture.state.eqs).toContainEqual(["status", "approved"]);
    expect(rows.map((item) => item.status)).toEqual(["approved"]);
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
