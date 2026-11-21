import { NextResponse } from "next/server";
import { consentUpdate } from "@/lib/marketing/audience";
import { marketingError, requireStaff } from "@/lib/marketing/http";
import { searchPeople, setConsent } from "@/lib/marketing/store";
import { isValidEmail, normalizeEmail } from "@/lib/validation";

export async function GET(req: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const query = new URL(req.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ people: await searchPeople(query) });
  } catch (error) {
    return marketingError(error);
  }
}

export async function POST(req: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => null) as { email?: unknown; customerId?: unknown; status?: unknown; explicit?: unknown } | null;
  const decision = consentUpdate({ status: body?.status, explicit: body?.explicit });
  if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: 400 });
  if (typeof body?.email !== "string" || !isValidEmail(body.email)) {
    return NextResponse.json({ error: "Enter the person's email address." }, { status: 400 });
  }
  try {
    await setConsent({
      email: normalizeEmail(body.email),
      customerId: typeof body.customerId === "string" ? body.customerId : null,
      status: decision.status,
      reason: decision.reason,
      source: "staff",
      actor: auth.email ?? auth.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return marketingError(error);
  }
}
