import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getDisplayBySlug, updateDisplay } from "@/lib/db";
import { publicPayloadWithFilm } from "@/lib/display-screen";
import {
  isDisplaySlug,
  isSelectableDefaultMode,
  sanitizeCustomMessage,
} from "@/lib/display";
import { toAdminDisplay } from "@/lib/display-admin";
import { sanitizeStudioLines } from "@/lib/studio-info";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readSlug(params: Promise<{ slug: string }>) {
  const { slug } = await params;
  return slug;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = await readSlug(params);
  if (!isDisplaySlug(slug)) return json({ error: "Unknown screen" }, 404);

  try {
    const row = await getDisplayBySlug(slug);
    if (!row) return json({ error: "Unknown screen" }, 404);
    return json(await publicPayloadWithFilm(row));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GET /api/displays/:slug]", message);
    return json({ error: "Failed to load display" }, 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const slug = await readSlug(params);
  if (!isDisplaySlug(slug)) return json({ error: "Unknown screen" }, 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "Invalid JSON" }, 400);
  const record = body as Record<string, unknown>;

  const patch: {
    mode?: string;
    override_mode?: string | null;
    override_payload?: { message: string } | null;
    show_studio_bookings?: boolean;
    studio_info_lines?: string[];
    studio_checkout_lines?: string[];
  } = {};

  if ("mode" in record) {
    if (typeof record.mode !== "string" || !isSelectableDefaultMode(record.mode)) {
      return json({ error: "That default mode is not available." }, 400);
    }
    patch.mode = record.mode;
  }

  if ("showStudioBookings" in record) {
    if (typeof record.showStudioBookings !== "boolean") {
      return json({ error: "Show studio bookings must be on or off." }, 400);
    }
    patch.show_studio_bookings = record.showStudioBookings;
  }

  if ("studioInfoLines" in record) {
    if (!Array.isArray(record.studioInfoLines)) {
      return json({ error: "Studio info must be a list of lines." }, 400);
    }
    patch.studio_info_lines = sanitizeStudioLines(record.studioInfoLines);
  }

  if ("studioCheckoutLines" in record) {
    if (!Array.isArray(record.studioCheckoutLines)) {
      return json({ error: "Checkout notes must be a list of lines." }, 400);
    }
    patch.studio_checkout_lines = sanitizeStudioLines(record.studioCheckoutLines);
  }

  if (record.clearOverride === true) {
    patch.override_mode = null;
    patch.override_payload = null;
  } else if ("overrideMessage" in record) {
    const message = sanitizeCustomMessage(record.overrideMessage);
    if (!message) return json({ error: "Enter a message, or clear the override." }, 400);
    patch.override_mode = "custom_message";
    patch.override_payload = { message };
  }

  if (Object.keys(patch).length === 0) return json({ error: "Nothing to update." }, 400);

  try {
    const updated = await updateDisplay(slug, patch);
    if (!updated) return json({ error: "Unknown screen" }, 404);
    return json(toAdminDisplay(updated));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[PATCH /api/displays/:slug]", message);
    return json({ error: "Failed to update display" }, 500);
  }
}
