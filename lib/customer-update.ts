import type { Customer } from "@/lib/types";
import { normalizeCustomerName } from "@/lib/validation";

type CustomerPatchBody = Partial<{
  first_name: unknown;
  last_name: unknown;
  email: unknown;
  phone: unknown;
  notes: unknown;
  total_rolls: unknown;
  total_dropoffs: unknown;
  normalized_name: unknown;
  last_dropoff_date: unknown;
  last_order_number: unknown;
  current_rolls: unknown;
  preferred_contact_method: Customer["preferred_contact_method"];
  default_film_type: Customer["default_film_type"];
  default_film_process: Customer["default_film_process"];
  default_scan_size: Customer["default_scan_size"];
  default_delivery_preference: Customer["default_delivery_preference"];
}>;

export function normalizedNameFromCustomerParts(first: string, last?: string | null): string {
  return normalizeCustomerName(`${first} ${last ?? ""}`.trim());
}

/** Build a Supabase patch from JSON body keys that were actually sent. */
export function buildCustomerPatchFromBody(body: CustomerPatchBody): {
  patch: Partial<Customer>;
  error?: string;
} {
  const patch: Partial<Customer> = {};

  if (body.first_name !== undefined) {
    const first = String(body.first_name).trim();
    if (!first) return { patch, error: "First name is required" };
    patch.first_name = first;
  }

  if (body.last_name !== undefined) {
    const last = body.last_name == null ? "" : String(body.last_name).trim();
    patch.last_name = last || undefined;
  }

  if (body.email !== undefined) {
    if (body.email == null || body.email === "") {
      patch.email = undefined;
    } else {
      patch.email = String(body.email).trim();
    }
  }

  if (body.phone !== undefined) {
    const phone = body.phone == null ? "" : String(body.phone).trim();
    patch.phone = phone || undefined;
  }

  if (body.notes !== undefined) patch.notes = body.notes == null ? undefined : String(body.notes);
  if (body.total_rolls !== undefined) patch.total_rolls = body.total_rolls as number;
  if (body.total_dropoffs !== undefined) patch.total_dropoffs = body.total_dropoffs as number;
  if (body.last_dropoff_date !== undefined) patch.last_dropoff_date = body.last_dropoff_date as string;
  if (body.last_order_number !== undefined) patch.last_order_number = body.last_order_number as string;
  if (body.current_rolls !== undefined) patch.current_rolls = body.current_rolls as number;
  if (body.preferred_contact_method !== undefined) {
    const raw = body.preferred_contact_method as unknown;
    patch.preferred_contact_method =
      raw === null || raw === ""
        ? (null as unknown as Customer["preferred_contact_method"])
        : (raw as Customer["preferred_contact_method"]);
  }
  if (body.default_film_type !== undefined) {
    const raw = body.default_film_type as unknown;
    patch.default_film_type =
      raw === null || raw === ""
        ? (null as unknown as Customer["default_film_type"])
        : (raw as Customer["default_film_type"]);
  }
  if (body.default_film_process !== undefined) {
    const raw = body.default_film_process as unknown;
    patch.default_film_process =
      raw === null || raw === ""
        ? (null as unknown as Customer["default_film_process"])
        : (raw as Customer["default_film_process"]);
  }
  if (body.default_scan_size !== undefined) {
    const raw = body.default_scan_size as unknown;
    patch.default_scan_size =
      raw === null || raw === ""
        ? (null as unknown as Customer["default_scan_size"])
        : (raw as Customer["default_scan_size"]);
  }
  if (body.default_delivery_preference !== undefined) {
    const raw = body.default_delivery_preference as unknown;
    patch.default_delivery_preference =
      raw === null || raw === ""
        ? (null as unknown as Customer["default_delivery_preference"])
        : (raw as Customer["default_delivery_preference"]);
  }

  // Ignore client-sent normalized_name; recomputed on server when name changes.
  if (body.normalized_name !== undefined && body.first_name === undefined && body.last_name === undefined) {
    patch.normalized_name = body.normalized_name as string;
  }

  return { patch };
}

export function applyNormalizedNameToPatch(
  patch: Partial<Customer>,
  current: Customer,
): Partial<Customer> {
  if (patch.first_name === undefined && patch.last_name === undefined) return patch;
  const first = patch.first_name ?? current.first_name;
  const last = patch.last_name !== undefined ? patch.last_name : current.last_name;
  return {
    ...patch,
    normalized_name: normalizedNameFromCustomerParts(first, last),
  };
}

/** True when the patch will change the stored customer email (including clear). */
export function customerEmailWillChange(current: Customer, patch: Partial<Customer>): boolean {
  if (patch.email === undefined) return false;
  return (patch.email ?? "") !== (current.email ?? "");
}
