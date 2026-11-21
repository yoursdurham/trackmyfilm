import { NextResponse } from "next/server";
import { parseFilter } from "@/lib/marketing/audience";
import { parseExits, parseTrigger } from "@/lib/marketing/automations";
import { marketingError, requireStaff } from "@/lib/marketing/http";
import { parseBlocks } from "@/lib/marketing/messages";
import { automationHistory, previewFilter, saveAutomation, setAutomationStatus } from "@/lib/marketing/store";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  try {
    const history = await automationHistory(id);
    if (!history) return NextResponse.json({ error: "Automation not found." }, { status: 404 });
    const preview = await previewFilter(history.automation.eligibility);
    return NextResponse.json({ ...history, preview });
  } catch (error) {
    return marketingError(error);
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const actor = auth.email ?? auth.id;
  try {
    if (body?.action === "status") {
      if (body.status !== "draft" && body.status !== "active" && body.status !== "paused") {
        return NextResponse.json({ error: "Choose draft, active, or paused." }, { status: 400 });
      }
      const saved = await setAutomationStatus(id, body.status, actor);
      if (!saved) return NextResponse.json({ error: "Automation not found." }, { status: 404 });
      return NextResponse.json(saved);
    }
    const trigger = parseTrigger(body?.trigger);
    if ("error" in trigger) return NextResponse.json({ error: trigger.error }, { status: 400 });
    const eligibility = parseFilter(body?.eligibility);
    if ("error" in eligibility) return NextResponse.json({ error: eligibility.error }, { status: 400 });
    const exits = parseExits(body?.exits ?? []);
    if ("error" in exits) return NextResponse.json({ error: exits.error }, { status: 400 });
    const blocks = parseBlocks(body?.blocks ?? []);
    if ("error" in blocks) return NextResponse.json({ error: blocks.error }, { status: 400 });
    const delayHours = body?.delayHours;
    if (typeof delayHours !== "number" || delayHours < 0 || delayHours > 8760) {
      return NextResponse.json({ error: "Delay needs a number of hours from 0 to 8760." }, { status: 400 });
    }
    const current = await automationHistory(id);
    if (!current) return NextResponse.json({ error: "Automation not found." }, { status: 404 });
    const saved = await saveAutomation(id, {
      ...current.automation,
      name: typeof body?.name === "string" ? body.name : current.automation.name,
      description: typeof body?.description === "string" ? body.description : current.automation.description,
      trigger,
      delayHours,
      eligibility,
      exits,
      cooldownDays: typeof body?.cooldownDays === "number" ? body.cooldownDays : current.automation.cooldownDays,
      reentry: body?.reentry === "after_cooldown" ? "after_cooldown" : "never",
      subject: typeof body?.subject === "string" ? body.subject : current.automation.subject,
      previewText: typeof body?.previewText === "string" ? body.previewText : current.automation.previewText,
      blocks,
      plainText: typeof body?.plainText === "string" ? body.plainText : current.automation.plainText,
    }, actor);
    return NextResponse.json(saved);
  } catch (error) {
    return marketingError(error);
  }
}
