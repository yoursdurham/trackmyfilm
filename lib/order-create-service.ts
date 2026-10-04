/**
 * Shared order creation for manual drop-offs and pending Squarespace imports.
 */

import {
  createCustomer,
  createOrder,
  getCustomerByEmailOrName,
  getOrderByExternalImport,
  getOrderByNumber,
  updateCustomer,
} from "@/lib/db";
import { IMPORT_SOURCE_SQUARESPACE, ORDER_STATUS, PENDING_INTAKE_STATUS } from "@/lib/constants";
import { sendOrderEmail } from "@/lib/email-service";
import {
  isValidEmail,
  normalizeCustomerName,
  normalizeEmail,
  normalizeFilmType,
  normalizeOrderNumber,
  validateRollDetails,
} from "@/lib/validation";
import type { Customer, FilmOrder, FilmProcess, RollDetail } from "@/lib/types";

export type OrderIntakeMode = "manual_received" | "pending_import";

export type OrderImportMetadata = {
  import_source: string;
  external_order_id: string;
};

export type CreateTrackMyFilmOrderInput = {
  customer_name: string;
  customer_email?: string;
  order_number: string;
  dropoff_date: string;
  roll_count: number;
  film_type: string;
  film_process: string;
  film_stock?: string;
  roll_details?: RollDetail[];
  prints_4x6?: boolean;
  notes?: string;
  import?: OrderImportMetadata;
};

export type CreateTrackMyFilmOrderOptions = {
  intake_mode: OrderIntakeMode;
  send_email?: boolean;
};

export type CreateTrackMyFilmOrderSuccess = {
  success: true;
  order: FilmOrder;
  customer: Customer;
  createdCustomer: boolean;
  /** Set after manual_received customer totals update. */
  customer_total_dropoffs?: number;
  email: {
    sent: boolean;
    skipped?: boolean;
    variant?: string;
    emailId?: string;
    error?: string;
  };
};

export type CreateTrackMyFilmOrderFailure = {
  success: false;
  error: string;
  status: number;
};

export type CreateTrackMyFilmOrderResult =
  | CreateTrackMyFilmOrderSuccess
  | CreateTrackMyFilmOrderFailure;

export function deriveOrderFilmProcess(
  roll_details: RollDetail[] | undefined,
  fallback: string
): FilmProcess {
  if (!roll_details?.length) return fallback as FilmProcess;
  const hasColor = roll_details.some(
    (r) => r.film_process === "Color" || r.film_process === "Both"
  );
  const hasBw = roll_details.some(
    (r) => r.film_process === "Black & White" || r.film_process === "Both"
  );
  if (hasColor && hasBw) return "Both";
  return roll_details[0].film_process;
}

export function resolveOrderDateInput(input?: string): string {
  if (!input) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

export type NormalizedCreateOrderPayload = {
  customer_name: string;
  customer_email: string | null;
  normalized_name: string;
  first_name: string;
  last_name: string | undefined;
  order_number: string;
  dropoff_date: string;
  roll_count: number;
  film_type: NonNullable<ReturnType<typeof normalizeFilmType>>;
  film_process: FilmProcess;
  film_stock?: string;
  roll_details?: RollDetail[];
  prints_4x6?: boolean;
  notes?: string;
  import?: OrderImportMetadata;
};

export function normalizeCreateOrderInput(
  raw: CreateTrackMyFilmOrderInput,
  intake_mode: OrderIntakeMode
): { ok: true; value: NormalizedCreateOrderPayload } | { ok: false; error: string; status: number } {
  const missing: string[] = [];
  if (!raw.customer_name?.trim()) missing.push("customer_name");
  if (!raw.order_number?.trim()) missing.push("order_number");
  if (!raw.roll_count || raw.roll_count < 1) missing.push("roll_count");
  if (!raw.film_type) missing.push("film_type");
  if (!raw.film_process) missing.push("film_process");
  if (!raw.dropoff_date?.trim()) missing.push("dropoff_date");
  if (missing.length) {
    return { ok: false, error: `Missing required fields: ${missing.join(", ")}`, status: 400 };
  }

  if (intake_mode === "pending_import") {
    if (!raw.import?.external_order_id?.trim()) {
      return { ok: false, error: "external_order_id is required for pending import", status: 400 };
    }
    if (!raw.import.import_source?.trim()) {
      return { ok: false, error: "import_source is required for pending import", status: 400 };
    }
    if (!raw.customer_email?.trim()) {
      return { ok: false, error: "customer_email is required for pending import", status: 400 };
    }
  }

  const rollDetailsError = validateRollDetails(raw.roll_details);
  if (rollDetailsError) {
    return { ok: false, error: rollDetailsError, status: 400 };
  }

  const normalizedFilmType = normalizeFilmType(raw.film_type);
  if (!normalizedFilmType) {
    return { ok: false, error: `Invalid film_type: ${String(raw.film_type)}`, status: 400 };
  }

  const normalizedRollDetails = raw.roll_details?.map((roll) => ({
    ...roll,
    film_type: normalizeFilmType(roll.film_type) ?? roll.film_type,
  }));

  const normalizedEmail = raw.customer_email ? normalizeEmail(raw.customer_email) : null;
  if (normalizedEmail && !isValidEmail(normalizedEmail)) {
    return { ok: false, error: "Invalid customer email address", status: 400 };
  }

  const customerName = raw.customer_name.trim();
  const nameParts = customerName.split(/\s+/);
  const resolvedFilmProcess = deriveOrderFilmProcess(normalizedRollDetails, raw.film_process);

  return {
    ok: true,
    value: {
      customer_name: customerName,
      customer_email: normalizedEmail,
      normalized_name: normalizeCustomerName(customerName),
      first_name: nameParts[0],
      last_name: nameParts.slice(1).join(" ") || undefined,
      order_number: normalizeOrderNumber(raw.order_number),
      dropoff_date: resolveOrderDateInput(raw.dropoff_date),
      roll_count: raw.roll_count,
      film_type: normalizedFilmType,
      film_process: resolvedFilmProcess,
      film_stock: raw.film_stock,
      roll_details: normalizedRollDetails,
      prints_4x6: raw.prints_4x6,
      notes: raw.notes,
      import: raw.import,
    },
  };
}

async function findOrCreateCustomer(
  payload: NormalizedCreateOrderPayload,
  intake_mode: OrderIntakeMode
): Promise<
  | { ok: true; customer: Customer; created: boolean }
  | { ok: false; error: string; status: number }
> {
  let customer = await getCustomerByEmailOrName(payload.customer_email, payload.normalized_name);
  if (customer) {
    return { ok: true, customer, created: false };
  }

  if (!payload.customer_email) {
    return {
      ok: false,
      error: "Customer email is required when creating a new customer",
      status: 400,
    };
  }

  try {
    customer = await createCustomer({
      first_name: payload.first_name,
      last_name: payload.last_name,
      email: payload.customer_email,
      normalized_name: payload.normalized_name,
      total_rolls: 0,
      total_dropoffs: 0,
    });
    return { ok: true, customer, created: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error(`[order-create] createCustomer failed (${intake_mode}):`, message);
    return { ok: false, error: `Failed to create customer: ${message}`, status: 500 };
  }
}

async function assertNoDuplicateOrder(
  payload: NormalizedCreateOrderPayload,
  intake_mode: OrderIntakeMode
): Promise<CreateTrackMyFilmOrderFailure | null> {
  if (intake_mode === "pending_import" && payload.import) {
    const existingExternal = await getOrderByExternalImport(
      payload.import.import_source,
      payload.import.external_order_id
    );
    if (existingExternal) {
      return {
        success: false,
        error: `Import ${payload.import.external_order_id} was already imported`,
        status: 409,
      };
    }
  }

  const existingOrderNum = await getOrderByNumber(payload.order_number);
  if (existingOrderNum) {
    return {
      success: false,
      error: `Order number ${payload.order_number} already exists`,
      status: 409,
    };
  }

  return null;
}

/** Central entry point for creating orders (manual received or pending import). */
export async function createTrackMyFilmOrder(
  raw: CreateTrackMyFilmOrderInput,
  options: CreateTrackMyFilmOrderOptions
): Promise<CreateTrackMyFilmOrderResult> {
  const { intake_mode, send_email = true } = options;

  const normalized = normalizeCreateOrderInput(raw, intake_mode);
  if (!normalized.ok) {
    return { success: false, error: normalized.error, status: normalized.status };
  }
  const payload = normalized.value;

  const duplicateError = await assertNoDuplicateOrder(payload, intake_mode);
  if (duplicateError) return duplicateError;

  const customerResult = await findOrCreateCustomer(payload, intake_mode);
  if (!customerResult.ok) {
    return { success: false, error: customerResult.error, status: customerResult.status };
  }
  const { customer, created: createdCustomer } = customerResult;

  const now = new Date().toISOString();
  const isPending = intake_mode === "pending_import";

  const newTotalDropoffs = (customer.total_dropoffs || 0) + 1;
  const newTotalRolls = (customer.total_rolls || 0) + payload.roll_count;

  let order: FilmOrder;
  try {
    order = await createOrder({
      customer_id: customer.id,
      customer_email: payload.customer_email ?? "",
      customer_name: payload.customer_name,
      order_number: payload.order_number,
      dropoff_date: payload.dropoff_date,
      roll_count: payload.roll_count,
      film_type: payload.film_type,
      film_process: payload.film_process,
      film_stock: payload.film_stock,
      roll_details: payload.roll_details,
      prints_4x6: payload.prints_4x6,
      dropoff_number: isPending ? 0 : newTotalDropoffs,
      status: isPending ? PENDING_INTAKE_STATUS : ORDER_STATUS.RECEIVED_BY_YOURS,
      status_history: isPending
        ? []
        : [{ status: ORDER_STATUS.RECEIVED_BY_YOURS, changed_at: now }],
      status_updated_at: now,
      received_by_yours_at: isPending ? undefined : now,
      pending_intake: isPending ? true : false,
      import_source: isPending ? payload.import?.import_source : undefined,
      external_order_id: isPending ? payload.import?.external_order_id : undefined,
      imported_at: isPending ? now : undefined,
      notes: payload.notes,
    });
  } catch (err: unknown) {
    return {
      success: false,
      error: `Failed to create order: ${err instanceof Error ? err.message : "unknown"}`,
      status: 500,
    };
  }

  const emailResult: CreateTrackMyFilmOrderSuccess["email"] = { sent: false };

  if (!isPending) {
    try {
      await updateCustomer(customer.id, {
        total_rolls: newTotalRolls,
        total_dropoffs: newTotalDropoffs,
        last_order_number: payload.order_number,
        current_rolls: payload.roll_count,
        last_dropoff_date: payload.dropoff_date,
      });
    } catch {
      console.error(
        `[order-create] Failed to update totals for customer ${customer.id} on order ${payload.order_number}`
      );
    }

    if (!send_email) {
      emailResult.skipped = true;
    } else if (payload.customer_email) {
      try {
        const emailData = (await sendOrderEmail(order.id, "film_drop_received")) as {
          skipped?: boolean;
          variant?: string;
          emailId?: string;
        };
        if (emailData.skipped) {
          emailResult.skipped = true;
        } else {
          emailResult.sent = true;
          emailResult.variant = emailData.variant;
          emailResult.emailId = emailData.emailId;
        }
      } catch (err: unknown) {
        emailResult.error = err instanceof Error ? err.message : "Email fetch failed";
      }
    } else {
      emailResult.skipped = true;
      emailResult.error = "No customer email — email not sent";
    }
  } else {
    emailResult.skipped = true;
  }

  return {
    success: true,
    order,
    customer,
    createdCustomer,
    customer_total_dropoffs: isPending ? undefined : newTotalDropoffs,
    email: emailResult,
  };
}

/** Map staff/Squarespace import body to shared create input. */
export function squarespaceImportToCreateInput(input: {
  external_order_id: string;
  customer_name: string;
  customer_email: string;
  order_number?: string;
  order_date?: string;
  roll_count: number;
  film_type: string;
  film_process: string;
  film_stock?: string;
  roll_details?: RollDetail[];
  prints_4x6?: boolean;
  notes?: string;
}): CreateTrackMyFilmOrderInput {
  const externalId = input.external_order_id.trim();
  return {
    customer_name: input.customer_name,
    customer_email: input.customer_email,
    order_number: input.order_number?.trim() || `SQ-${externalId}`,
    dropoff_date: resolveOrderDateInput(input.order_date),
    roll_count: input.roll_count,
    film_type: input.film_type,
    film_process: input.film_process,
    film_stock: input.film_stock,
    roll_details: input.roll_details,
    prints_4x6: input.prints_4x6,
    notes: input.notes,
    import: {
      import_source: IMPORT_SOURCE_SQUARESPACE,
      external_order_id: externalId,
    },
  };
}
