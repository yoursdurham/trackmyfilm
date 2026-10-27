import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser storage client for the public embed iframe.
 *
 * uploadToSignedUrl authorizes the write with the signed token, not a user
 * session. This client never reads or writes cookies or localStorage, so
 * third-party cookie blocking inside a yoursdurham.com iframe cannot stop it.
 * The public anon key is still sent as the Supabase apikey header.
 */
const memoryAuthStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export function fetchWithoutCredentials(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, credentials: "omit" });
}

export function createSignedUploadClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: memoryAuthStorage,
    },
    global: {
      fetch: fetchWithoutCredentials,
    },
  });
}
