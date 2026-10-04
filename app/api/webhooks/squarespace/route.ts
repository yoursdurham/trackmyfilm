import { NextResponse } from "next/server";
import { importSquarespaceOrder } from "@/lib/pending-intake-service";
import type { SquarespaceImportInput } from "@/lib/pending-intake";

function verifyWebhookSecret(req: Request): boolean {
  const secret = process.env.SQUARESPACE_WEBHOOK_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!verifyWebhookSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SquarespaceImportInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await importSquarespaceOrder(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }

  return NextResponse.json(
    {
      success: true,
      order_id: result.order.id,
      order_number: result.order.order_number,
      pending_intake: true,
    },
    { status: 201 }
  );
}
