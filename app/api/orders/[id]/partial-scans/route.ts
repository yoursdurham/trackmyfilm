import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { recordPartialScanDelivery } from "@/lib/partial-scan-service";
import type { ScanDeliveryBatch } from "@/lib/scan-batch";

function isScanBatch(value: string): value is ScanDeliveryBatch {
  return value === "Color" || value === "Black & White";
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await req.json() as {
      batch?: string;
      wetransfer_link?: string;
      send_email?: boolean;
    };

    const batch = body.batch?.trim() ?? "";
    if (!isScanBatch(batch)) {
      return NextResponse.json(
        { error: 'batch must be "Color" or "Black & White"' },
        { status: 400 }
      );
    }

    const result = await recordPartialScanDelivery({
      order_id: id,
      batch,
      wetransfer_link: body.wetransfer_link ?? "",
      send_email: body.send_email !== false,
    });

    if (!result.success) {
      const status = result.error === "Order not found" ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
