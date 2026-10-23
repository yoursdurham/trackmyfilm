import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { isReviewStatus, isUuid } from "@/lib/photo-submissions";
import { reviewPhotoSubmission } from "@/lib/photo-submissions-server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "That photo was not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null) as { status?: unknown } | null;
  if (!isReviewStatus(body?.status)) {
    return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });
  }

  const reviewedBy = auth.email?.trim() || auth.id;
  try {
    const submission = await reviewPhotoSubmission(id, body.status, reviewedBy);
    if (!submission) {
      return NextResponse.json({ error: "That photo was not found." }, { status: 404 });
    }
    return NextResponse.json({ submission }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[photo-submissions]", error instanceof Error ? error.message : "review failed");
    return NextResponse.json({ error: "That update didn't save." }, { status: 500 });
  }
}
