import { getFilmMenu } from "@/lib/db";
import { sanitizeFilmMenu, type FilmMenu } from "@/lib/film-menu";

const CACHE_TTL_MS = 20_000;

let cached: { value: FilmMenu | null; expiresAt: number } | null = null;
let pending: Promise<FilmMenu | null> | null = null;

export function clearFilmMenuCache(): void {
  cached = null;
  pending = null;
}

/** One shop menu. Saves call clearFilmMenuCache so the next poll picks up the edit. */
export async function getCachedFilmMenu(): Promise<FilmMenu | null> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (!pending) {
    pending = getFilmMenu()
      .then((raw) => {
        const value = sanitizeFilmMenu(raw);
        cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
        return value;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}
