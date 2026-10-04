/**
 * PATCH /api/incoming-drafts/:id
 * Logged-in staff only. Marks a pending draft accepted or dismissed.
 * Does not create a film order and does not send email.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getIncomingDraftById, updateIncomingDraftStatus } from "@/lib/db";
import { isIncomingDraftUuid, resolveIncomingDraftStatusChange } from "@/lib/incoming-drafts";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!isIncomingDraftUuid(id)) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const requested = body && typeof body === "object" && !Array.isArray(body)
    ? (body as { status?: unknown }).status
    : undefined;

  try {
    const draft = await getIncomingDraftById(id);
    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const decision = resolveIncomingDraftStatusChange(draft.status, requested);
    if (!decision.ok) {
      return NextResponse.json(
        { error: decision.error },
        { status: decision.reason === "conflict" ? 409 : 400 }
      );
    }

    if (!decision.changed) {
      return NextResponse.json(draft);
    }

    const updated = await updateIncomingDraftStatus(id, decision.status);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[PATCH /api/incoming-drafts/:id]", message);
    return NextResponse.json({ error: "Failed to update draft" }, { status: 500 });
  }
}
