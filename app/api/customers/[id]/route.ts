import { NextResponse } from "next/server";
import { getCustomerById, getCustomerProfile, deleteCustomer, getCustomerByEmail } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { isValidEmail, normalizeEmail } from "@/lib/validation";
import { applyNormalizedNameToPatch, buildCustomerPatchFromBody } from "@/lib/customer-update";
import { patchCustomerWithOrderEmailSync } from "@/lib/customer-email-sync";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const profile = await getCustomerProfile(id);
    if (!profile) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    return NextResponse.json(profile);
  } catch {
    return NextResponse.json({ error: "Failed to fetch customer" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await req.json();

    const { patch: rawPatch, error: buildError } = buildCustomerPatchFromBody(body);
    if (buildError) {
      return NextResponse.json({ error: buildError }, { status: 400 });
    }

    if (rawPatch.email !== undefined && rawPatch.email !== "" && !isValidEmail(rawPatch.email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    if (Object.keys(rawPatch).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const current = await getCustomerById(id);
    if (!current) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    let patch = { ...rawPatch };
    if (patch.email !== undefined && patch.email !== "") {
      const normalized = normalizeEmail(patch.email);
      const existing = await getCustomerByEmail(normalized);
      if (existing && existing.id !== id) {
        return NextResponse.json(
          { error: "Another customer already uses this email address" },
          { status: 409 },
        );
      }
      patch.email = normalized;
    }

    patch = applyNormalizedNameToPatch(patch, current);

    const { customer, ordersUpdated } = await patchCustomerWithOrderEmailSync(id, current, patch);
    if (ordersUpdated > 0) {
      console.log("[PATCH /api/customers] Synced customer_email on orders:", {
        customerId: id,
        ordersUpdated,
      });
    }
    return NextResponse.json(customer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update customer";
    console.error("[PATCH /api/customers]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    await deleteCustomer(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 });
  }
}
