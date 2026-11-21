import { NextResponse } from "next/server";
import { marketingError, requireStaff } from "@/lib/marketing/http";
import { personProfile } from "@/lib/marketing/store";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  try {
    const profile = await personProfile(id);
    if (!profile) return NextResponse.json({ error: "That customer is not in the marketing list." }, { status: 404 });
    return NextResponse.json(profile);
  } catch (error) {
    return marketingError(error);
  }
}
