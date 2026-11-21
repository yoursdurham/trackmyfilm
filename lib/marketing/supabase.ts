import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function marketingSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new MarketingStorageError("Supabase is not configured on the server.");
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export class MarketingStorageError extends Error {
  missingMigration: boolean;

  constructor(message: string, missingMigration = false) {
    super(message);
    this.name = "MarketingStorageError";
    this.missingMigration = missingMigration;
  }
}

export function raiseStorage(error: { message: string; code?: string }): never {
  const missing = error.code === "42P01"
    || error.code === "PGRST205"
    || /marketing_/i.test(error.message) && /does not exist|schema cache|could not find/i.test(error.message);
  throw new MarketingStorageError(
    missing
      ? "Marketing tables are not in the database yet. Run supabase/migrations/033_marketing_email.sql in the Supabase SQL editor. Nothing has been sent."
      : error.message,
    missing,
  );
}
