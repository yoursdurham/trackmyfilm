import { NextResponse } from "next/server";
import {
  acceptMarketingDraft,
  draftIsRateLimited,
  DRAFT_RATE_LIMIT_MESSAGE,
  friendlyDraftFailure,
  parseDraftRequest,
} from "@/lib/marketing/ai-draft";
import { generateMarketingDraft } from "@/lib/marketing/ai-draft-model";
import { requireStaff } from "@/lib/marketing/http";

export async function POST(req: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => null);
  const request = parseDraftRequest(body);
  if ("error" in request) return NextResponse.json({ error: request.error }, { status: 400 });
  if (draftIsRateLimited(auth.id)) {
    return NextResponse.json({ error: DRAFT_RATE_LIMIT_MESSAGE }, { status: 429 });
  }
  try {
    const output = await generateMarketingDraft(request);
    const draft = acceptMarketingDraft(output);
    if ("error" in draft) return NextResponse.json({ error: draft.error }, { status: 422 });
    return NextResponse.json(draft);
  } catch (error) {
    const failure = friendlyDraftFailure(error);
    console.error("[marketing/draft]", error instanceof Error ? error.name : "error", failure.status);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
