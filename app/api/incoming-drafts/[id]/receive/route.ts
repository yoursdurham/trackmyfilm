/**
 * POST /api/incoming-drafts/:id/receive
 * Logged-in staff only. Approve & Receive turns a Pending Intake item into a
 * real drop-off: status Received by Yours, received timestamp, status history,
 * and the normal confirmation email when send_email is not false.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getIncomingDraftById, updateIncomingDraftStatus } from "@/lib/db";
import { createFilmDropoff, type DropoffRequest } from "@/lib/dropoff-service";
import { isIncomingDraftUuid, PENDING_INTAKE_STATUS } from "@/lib/incoming-drafts";
import type { IncomingSquarespaceDraft, RollDetail } from "@/lib/types";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function receiveRequest(draft: IncomingSquarespaceDraft, body: Record<string, unknown>): DropoffRequest {
  const rolls = (Array.isArray(body.roll_details) ? body.roll_details : draft.roll_details) as RollDetail[];
  const first = rolls[0];
  const customerEmail = typeof body.customer_email === "string"
    ? body.customer_email
    : draft.customer_email ?? undefined;
  const dropoffDate = typeof body.dropoff_date === "string" && body.dropoff_date
    ? body.dropoff_date
    : draft.dropoff_date || todayIsoDate();

  return {
    customer_name: typeof body.customer_name === "string" && body.customer_name.trim()
      ? body.customer_name
      : draft.customer_name,
    customer_email: customerEmail || undefined,
    order_number: typeof body.order_number === "string" && body.order_number.trim()
      ? body.order_number
      : draft.squarespace_order_number,
    dropoff_date: dropoffDate,
    roll_count: typeof body.roll_count === "number" ? body.roll_count : draft.roll_count,
    film_type: typeof body.film_type === "string" && body.film_type ? body.film_type : first?.film_type ?? "",
    film_process: typeof body.film_process === "string" && body.film_process
      ? body.film_process
      : first?.film_process ?? "",
    film_stock: typeof body.film_stock === "string" ? body.film_stock : first?.film_stock,
    roll_details: rolls,
    notes: typeof body.notes === "string" ? body.notes : draft.notes ?? undefined,
    send_email: body.send_email !== false,
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!isIncomingDraftUuid(id)) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  const raw = await req.text();
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }

  try {
    const draft = await getIncomingDraftById(id);
    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    if (draft.status !== PENDING_INTAKE_STATUS) {
      return NextResponse.json(
        { error: `Draft is already ${draft.status} and cannot be received` },
        { status: 409 }
      );
    }

    const result = await createFilmDropoff(receiveRequest(draft, body));
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    try {
      await updateIncomingDraftStatus(id, "accepted", result.body.order.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[POST /api/incoming-drafts/:id/receive] order created but draft not cleared:", message);
      return NextResponse.json({
        ...result.body,
        warning: "Order was received, but the Pending Intake item could not be cleared.",
      }, { status: 201 });
    }

    return NextResponse.json(result.body, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[POST /api/incoming-drafts/:id/receive]", message);
    return NextResponse.json({ error: "Failed to receive draft" }, { status: 500 });
  }
}
