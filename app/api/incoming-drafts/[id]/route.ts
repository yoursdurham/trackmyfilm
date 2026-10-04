/**
 * PATCH /api/incoming-drafts/:id
 * Logged-in staff only.
 *   { status: "accepted" } marks the draft accepted. Does not create a film order or send email.
 *   { status: "dismissed" } hard-deletes the row so the Squarespace order can be imported again.
 *
 * DELETE /api/incoming-drafts/:id
 * Logged-in staff only. Hard-deletes the row in any status. Does not create or delete a film order.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { deleteIncomingDraft, getIncomingDraftById, updateIncomingDraftStatus } from "@/lib/db";
import { isIncomingDraftUuid, resolveIncomingDraftStatusChange } from "@/lib/incoming-drafts";

async function loadDraft(id: string) {
  if (!isIncomingDraftUuid(id)) {
    return { response: NextResponse.json({ error: "Draft not found" }, { status: 404 }) };
  }
  const draft = await getIncomingDraftById(id);
  if (!draft) {
    return { response: NextResponse.json({ error: "Draft not found" }, { status: 404 }) };
  }
  return { draft };
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const loaded = await loadDraft(id);
    if ("response" in loaded) return loaded.response;

    await deleteIncomingDraft(id);
    return NextResponse.json({ success: true, deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[DELETE /api/incoming-drafts/:id]", message);
    return NextResponse.json({ error: "Failed to delete draft" }, { status: 500 });
  }
}

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

    if (requested === "dismissed") {
      await deleteIncomingDraft(id);
      return NextResponse.json({ success: true, deleted: true });
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
