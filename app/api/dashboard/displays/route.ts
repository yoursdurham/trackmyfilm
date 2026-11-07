import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { listDisplays, updateDisplay } from "@/lib/db";
import { isDisplaySlug, isSelectableDefaultMode, type DisplayRow } from "@/lib/display";
import { endOfShopDay, isOpenSignMode } from "@/lib/shop-hours";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function view(row: DisplayRow) {
  return {
    slug: row.slug,
    name: row.name,
    mode: row.mode,
    openSignMode: isOpenSignMode(row.open_sign_mode) ? row.open_sign_mode : "off",
    showOpenSign: row.show_open_sign === true,
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const rows = await listDisplays();
    return json({ displays: rows.map(view) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GET /api/dashboard/displays]", message);
    return json({ error: "Failed to load displays" }, 500);
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "Invalid JSON" }, 400);
  const record = body as Record<string, unknown>;
  const slug = typeof record.slug === "string" ? record.slug : "";
  if (!isDisplaySlug(slug)) return json({ error: "Unknown screen" }, 404);

  const patch: Partial<DisplayRow> = {};
  if ("mode" in record) {
    if (typeof record.mode !== "string" || !isSelectableDefaultMode(record.mode)) {
      return json({ error: "That default mode is not available." }, 400);
    }
    patch.mode = record.mode;
  }
  if ("openSignMode" in record) {
    if (!isOpenSignMode(record.openSignMode)) {
      return json({ error: "Open sign must be Auto, On, or Off." }, 400);
    }
    patch.open_sign_mode = record.openSignMode;
    patch.open_sign_until = record.openSignMode === "on" ? endOfShopDay(new Date()).toISOString() : null;
  }
  if ("showOpenSign" in record) {
    if (typeof record.showOpenSign !== "boolean") {
      return json({ error: "Show open sign must be on or off." }, 400);
    }
    patch.show_open_sign = record.showOpenSign;
  }
  if (Object.keys(patch).length === 0) return json({ error: "Nothing to update." }, 400);

  try {
    const updated = await updateDisplay(slug, patch);
    if (!updated) return json({ error: "Unknown screen" }, 404);
    return json(view(updated));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[PATCH /api/dashboard/displays]", message);
    return json({ error: "Failed to update display" }, 500);
  }
}
