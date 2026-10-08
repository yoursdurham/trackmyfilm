import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { saveFilmMenu } from "@/lib/db";
import { clearFilmMenuCache, getCachedFilmMenu } from "@/lib/film-menu-cache";
import { filmMenuHasContent, sanitizeFilmMenu } from "@/lib/film-menu";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const menu = await getCachedFilmMenu();
    if (!filmMenuHasContent(menu)) {
      return json({ error: "Film menu is not set up yet." }, 404);
    }
    return json({ menu });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GET /api/film-menu]", message);
    return json({ error: "Failed to load the film menu" }, 500);
  }
}

export async function PUT(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const source = body && typeof body === "object" && "menu" in body
    ? (body as { menu?: unknown }).menu
    : body;
  const menu = sanitizeFilmMenu(source);
  if (!menu || (menu.sections.length === 0 && menu.notes.length === 0)) {
    return json({ error: "Add at least one item or note." }, 400);
  }

  try {
    const saved = sanitizeFilmMenu(await saveFilmMenu(menu));
    clearFilmMenuCache();
    return json({ menu: saved });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[PUT /api/film-menu]", message);
    return json({ error: "Failed to save the film menu" }, 500);
  }
}
