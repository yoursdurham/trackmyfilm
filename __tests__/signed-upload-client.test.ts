import { beforeEach, describe, expect, it, vi } from "vitest";

type SignedUploadOptions = {
  auth: {
    storage: { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };
  };
};

const createClient = vi.hoisted(() => vi.fn((url: string, key: string, options: SignedUploadOptions) => ({ url, key, options })));

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

import { createSignedUploadClient, fetchWithoutCredentials } from "@/lib/supabase/signed-upload-client";

describe("signed upload client", () => {
  beforeEach(() => {
    createClient.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("uploads with the anon key and no cookie or stored session", () => {
    createSignedUploadClient();
    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        }),
        global: { fetch: fetchWithoutCredentials },
      }),
    );
    const storage = createClient.mock.calls[0][2].auth.storage;
    expect(storage.getItem("sb-auth")).toBeNull();
    expect(() => storage.setItem("sb-auth", "session")).not.toThrow();
    expect(storage.getItem("sb-auth")).toBeNull();
  });

  it("omits credentials on the storage request", async () => {
    const inner = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", inner);
    await fetchWithoutCredentials("https://example.supabase.co/storage/v1/object/upload/sign/photo.jpg", {
      method: "PUT",
      credentials: "include",
    });
    expect(inner).toHaveBeenCalledWith(
      "https://example.supabase.co/storage/v1/object/upload/sign/photo.jpg",
      expect.objectContaining({ method: "PUT", credentials: "omit" }),
    );
    vi.unstubAllGlobals();
  });
});
