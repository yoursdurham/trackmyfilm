import { NextResponse } from "next/server";
import { parseFilter } from "@/lib/marketing/audience";
import { zonedLocalToUtc } from "@/lib/marketing/delivery";
import { marketingError, requireStaff } from "@/lib/marketing/http";
import { assertExplicitTestRecipient, findUnknownTokens, parseBlocks } from "@/lib/marketing/messages";
import {
  campaignReport,
  cancelRemaining,
  confirmCampaign,
  duplicateCampaign,
  getCampaign,
  retryFailed,
  saveCampaign,
  sendTest,
  setCampaignStatus,
} from "@/lib/marketing/store";
import { DEFAULT_TIMEZONE } from "@/lib/marketing/types";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  try {
    const report = await campaignReport(id);
    if (!report) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    return NextResponse.json(report);
  } catch (error) {
    return marketingError(error);
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const action = body?.action;
  const actor = auth.email ?? auth.id;
  try {
    if (action === "duplicate") {
      const copy = await duplicateCampaign(id, actor);
      if (!copy) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
      return NextResponse.json(copy);
    }
    if (action === "archive") {
      await setCampaignStatus(id, "archived", actor, "campaign.archived");
      return NextResponse.json({ ok: true });
    }
    if (action === "pause") {
      await setCampaignStatus(id, "paused", actor, "campaign.paused");
      return NextResponse.json({ ok: true });
    }
    if (action === "resume") {
      await setCampaignStatus(id, "sending", actor, "campaign.resumed");
      return NextResponse.json({ ok: true });
    }
    if (action === "cancel_remaining") {
      await cancelRemaining(id, actor);
      return NextResponse.json({ ok: true });
    }
    if (action === "retry_failed") {
      await retryFailed(id, actor);
      return NextResponse.json({ ok: true });
    }
    if (action === "test") {
      const to = assertExplicitTestRecipient(body?.to);
      if (typeof to !== "string") return NextResponse.json({ error: to.error }, { status: 400 });
      const found = await getCampaign(id);
      if (!found) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
      const result = await sendTest({
        to,
        subject: found.campaign.subject,
        previewText: found.campaign.previewText,
        blocks: found.campaign.blocks,
        plainText: found.campaign.plainText,
        actor,
      });
      return NextResponse.json(result);
    }
    if (action === "confirm") {
      if (body?.confirmed !== true) {
        return NextResponse.json({ error: "Check the confirmation box before scheduling." }, { status: 400 });
      }
      const scheduledAt = typeof body.scheduledAt === "string"
        ? body.scheduledAt
        : zonedLocalToUtc(String(body?.date ?? ""), String(body?.time ?? ""), DEFAULT_TIMEZONE)?.toISOString();
      if (!scheduledAt) return NextResponse.json({ error: "Choose a date and time. Times are America/New_York." }, { status: 400 });
      const found = await getCampaign(id);
      if (!found) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
      const unknown = findUnknownTokens(`${found.campaign.subject}\n${found.campaign.previewText}\n${found.campaign.plainText}`);
      if (unknown.length > 0) {
        return NextResponse.json({ error: `Remove unsupported placeholders: ${unknown.join(", ")}.` }, { status: 400 });
      }
      const result = await confirmCampaign({
        id,
        actor,
        shownFingerprint: typeof body.fingerprint === "string" ? body.fingerprint : "",
        scheduledAt,
      });
      if ("error" in result) return NextResponse.json(result, { status: result.status });
      return NextResponse.json(result);
    }
    if (action === "save") {
      const blocks = parseBlocks(body?.blocks ?? []);
      if ("error" in blocks) return NextResponse.json({ error: blocks.error }, { status: 400 });
      let adHocFilter = null;
      if (body?.adHocFilter) {
        const parsed = parseFilter(body.adHocFilter);
        if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
        adHocFilter = parsed;
      }
      const saved = await saveCampaign(id, { ...body, blocks, adHocFilter }, actor);
      if (!saved) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
      return NextResponse.json(saved);
    }
    return NextResponse.json({ error: "That action is not available." }, { status: 400 });
  } catch (error) {
    return marketingError(error);
  }
}
