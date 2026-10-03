/**
 * Incoming Squarespace drafts.
 *
 * POST — bot only. Authorization: Bearer $SQUARESPACE_INTAKE_SECRET.
 *        Creates a pending draft. Cannot create film orders, read customers, or send email.
 * GET  — logged-in staff only. Lists pending drafts for the dashboard.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import {
  createIncomingDraft,
  getIncomingDraftByOrderNumber,
  getPendingIncomingDrafts,
  orderNumberExists,
} from "@/lib/db";
import { parseIncomingDraftPayload } from "@/lib/incoming-drafts";
import { isSquarespaceIntakeAuthorized, SQUARESPACE_INTAKE_SECRET_ENV } from "@/lib/intake-auth";

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: string }).code ?? "") : "";
  const message = err instanceof Error ? err.message : "";
  return code === "23505" || message.toLowerCase().includes("duplicate key");
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) {
    // A valid intake token is still not a staff session, so it cannot list drafts.
    if (isSquarespaceIntakeAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return auth;
  }

  try {
    const drafts = await getPendingIncomingDrafts();
    return NextResponse.json(drafts);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GET /api/incoming-drafts]", message);
    return NextResponse.json({ error: "Failed to fetch incoming drafts" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!process.env[SQUARESPACE_INTAKE_SECRET_ENV]) {
    console.error(`[incoming-drafts] ${SQUARESPACE_INTAKE_SECRET_ENV} is not configured`);
  }
  if (!isSquarespaceIntakeAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseIncomingDraftPayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const orderNumber = parsed.value.squarespace_order_number;

  try {
    if (await orderNumberExists(orderNumber)) {
      return NextResponse.json(
        { error: `Order number ${orderNumber} already exists` },
        { status: 409 }
      );
    }

    const existingDraft = await getIncomingDraftByOrderNumber(orderNumber);
    if (existingDraft) {
      return NextResponse.json(
        { error: `Squarespace order number ${orderNumber} was already imported` },
        { status: 409 }
      );
    }

    const draft = await createIncomingDraft(parsed.value);
    return NextResponse.json(draft, { status: 201 });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: `Squarespace order number ${orderNumber} was already imported` },
        { status: 409 }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[POST /api/incoming-drafts]", message);
    return NextResponse.json({ error: "Failed to create draft" }, { status: 500 });
  }
}
