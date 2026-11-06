import { isDisplayPayload, type DisplayPayload } from "@/lib/display";

/** Per-screen copy of the last payload, so a reboot can paint without a request. */
export const DISPLAY_CACHE_PREFIX = "tmf-display-cache:v1:";

export interface CachedDisplay {
  fetchedAt: number;
  payload: DisplayPayload;
}

export function displayCacheKey(slug: string): string {
  return `${DISPLAY_CACHE_PREFIX}${slug}`;
}

type CacheStorage = Pick<Storage, "getItem" | "setItem">;

const snapshots = new Map<string, { raw: string | null; entry: CachedDisplay | null }>();

function rememberSnapshot(slug: string, raw: string | null, entry: CachedDisplay | null): CachedDisplay | null {
  const previous = snapshots.get(slug);
  if (previous && previous.raw === raw) return previous.entry;
  snapshots.set(slug, { raw, entry });
  return entry;
}

/** Stable client snapshot for useSyncExternalStore. Server renders render null. */
export function cachedDisplaySnapshot(slug: string): CachedDisplay | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(displayCacheKey(slug));
  } catch {
    raw = null;
  }
  const previous = snapshots.get(slug);
  if (previous && previous.raw === raw) return previous.entry;
  return rememberSnapshot(slug, raw, raw === null ? null : readDisplayCache(window.localStorage, slug));
}

export function subscribeDisplayCache(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener("tmf-display-cache", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("tmf-display-cache", onChange);
  };
}

export function readDisplayCache(storage: Pick<Storage, "getItem">, slug: string): CachedDisplay | null {
  try {
    const raw = storage.getItem(displayCacheKey(slug));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as { fetchedAt?: unknown; payload?: unknown };
    const fetchedAt = record.fetchedAt;
    if (typeof fetchedAt !== "number" || !Number.isFinite(fetchedAt)) return null;
    if (!isDisplayPayload(record.payload)) return null;
    return { fetchedAt, payload: record.payload };
  } catch {
    return null;
  }
}

export function writeDisplayCache(storage: CacheStorage, slug: string, entry: CachedDisplay): void {
  const body = JSON.stringify({
    fetchedAt: entry.fetchedAt,
    payload: entry.payload,
  });
  try {
    storage.setItem(displayCacheKey(slug), body);
    rememberSnapshot(slug, body, entry);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("tmf-display-cache"));
  } catch {
    // A full or blocked localStorage still shows the payload for this page load.
  }
}
