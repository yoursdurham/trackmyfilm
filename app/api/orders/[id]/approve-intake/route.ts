import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { approvePendingIntakeOrder } from "@/lib/pending-intake-service";
import type { PendingIntakeOrderEdits } from "@/lib/pending-intake";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  let body: { edits?: PendingIntakeOrderEdits; send_email?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const result = await approvePendingIntakeOrder(id, body.edits ?? {}, {
    send_email: body.send_email,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }

  return NextResponse.json({
    success: true,
    order: result.order,
    email_sent: result.email_sent,
    email_skipped: result.email_skipped,
    email_error: result.email_error,
  });
}
