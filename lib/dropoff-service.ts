/**
 * Creates a real film drop-off: customer match, order row, totals, and the
 * drop-off confirmation email. Hand-entered orders and Approve & Receive both use this.
 * Squarespace import must not call it.
 */

import {
  getCustomerByEmailOrName, createCustomer, updateCustomer,
  createOrder, getOrderByNumber,
} from "@/lib/db";
import {
  normalizeEmail, normalizeCustomerName, normalizeOrderNumber, isValidEmail,
  normalizeFilmType, validateRollDetails,
} from "@/lib/validation";
import { sendOrderEmail } from "@/lib/email-service";
import type { Customer, FilmOrder, FilmProcess, RollDetail } from "@/lib/types";

export interface DropoffRequest {
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
  send_email?: boolean;
}

export interface DropoffSuccess {
  ok: true;
  body: {
    success: true;
    order: FilmOrder;
    customer: {
      id: string;
      name: string;
      isNew: boolean;
      total_dropoffs: number;
    };
    email: {
      sent: boolean;
      skipped?: boolean;
      variant?: string;
      emailId?: string;
      error?: string;
    };
  };
}

export interface DropoffFailure {
  ok: false;
  status: number;
  error: string;
}

export type DropoffResult = DropoffSuccess | DropoffFailure;

function deriveOrderFilmProcess(roll_details: RollDetail[] | undefined, fallback: string): FilmProcess {
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

export async function createFilmDropoff(body: DropoffRequest): Promise<DropoffResult> {
  const {
    customer_name, customer_email, order_number,
    dropoff_date, roll_count, film_type, film_process, film_stock, roll_details, prints_4x6, notes,
    send_email = true,
  } = body;

  const missing = [];
  if (!customer_name?.trim()) missing.push("customer_name");
  if (!order_number?.trim()) missing.push("order_number");
  if (!roll_count || roll_count < 1) missing.push("roll_count");
  if (!film_type) missing.push("film_type");
  if (!film_process) missing.push("film_process");
  if (missing.length) {
    return { ok: false, status: 400, error: `Missing required fields: ${missing.join(", ")}` };
  }

  const normalizedFilmType = normalizeFilmType(film_type);
  if (!normalizedFilmType) {
    return { ok: false, status: 400, error: `Invalid film_type: ${String(film_type)}` };
  }

  const rollDetailsError = validateRollDetails(roll_details);
  if (rollDetailsError) {
    return { ok: false, status: 400, error: rollDetailsError };
  }

  const normalizedRollDetails = roll_details?.map((roll) => ({
    ...roll,
    film_type: normalizeFilmType(roll.film_type) ?? roll.film_type,
  }));

  const normalizedEmail = customer_email ? normalizeEmail(customer_email) : null;
  const nameParts = customer_name.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(" ") || null;
  const normalizedName = normalizeCustomerName(customer_name);
  const normalizedOrderNum = normalizeOrderNumber(order_number);
  const now = new Date().toISOString();

  if (normalizedEmail && !isValidEmail(normalizedEmail)) {
    return { ok: false, status: 400, error: "Invalid customer email address" };
  }

  const existingOrder = await getOrderByNumber(normalizedOrderNum);
  if (existingOrder) {
    return { ok: false, status: 409, error: `Order number ${normalizedOrderNum} already exists` };
  }

  let customer: Customer | null = await getCustomerByEmailOrName(normalizedEmail, normalizedName);
  const isNewCustomer = !customer;

  if (!customer) {
    if (!normalizedEmail) {
      return { ok: false, status: 400, error: "Customer email is required when creating a new customer" };
    }
    try {
      customer = await createCustomer({
        first_name: firstName,
        last_name: lastName ?? undefined,
        email: normalizedEmail,
        normalized_name: normalizedName,
        total_rolls: 0,
        total_dropoffs: 0,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown";
      console.error("[dropoff] createCustomer failed:", message);
      return { ok: false, status: 500, error: `Failed to create customer: ${message}` };
    }
  }

  const newTotalRolls = (customer.total_rolls || 0) + roll_count;
  const newTotalDropoffs = (customer.total_dropoffs || 0) + 1;
  const resolvedFilmProcess = deriveOrderFilmProcess(normalizedRollDetails, film_process);

  let order: FilmOrder;
  try {
    order = await createOrder({
      customer_id: customer.id,
      customer_email: normalizedEmail ?? "",
      customer_name: customer_name.trim(),
      order_number: normalizedOrderNum,
      dropoff_date,
      roll_count,
      film_type: normalizedFilmType,
      film_process: resolvedFilmProcess,
      film_stock: film_stock ?? undefined,
      roll_details: normalizedRollDetails ?? undefined,
      prints_4x6: prints_4x6 ?? undefined,
      dropoff_number: newTotalDropoffs,
      status: "Received by Yours",
      status_history: [{ status: "Received by Yours", changed_at: now }],
      received_by_yours_at: now,
      status_updated_at: now,
      notes: notes ?? undefined,
    });
  } catch (err: unknown) {
    return {
      ok: false,
      status: 500,
      error: `Failed to create order: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }

  try {
    const customerPatch: Partial<Customer> = {
      total_rolls: newTotalRolls,
      total_dropoffs: newTotalDropoffs,
      last_order_number: normalizedOrderNum,
      current_rolls: roll_count,
      last_dropoff_date: dropoff_date,
    };
    await updateCustomer(customer.id, customerPatch);
  } catch {
    console.error(`[dropoff] Failed to update totals for customer ${customer.id} on order ${normalizedOrderNum}`);
  }

  const emailResult: DropoffSuccess["body"]["email"] = { sent: false };

  if (!send_email) {
    emailResult.skipped = true;
  } else if (normalizedEmail) {
    try {
      const emailData = await sendOrderEmail(order.id, "film_drop_received") as {
        success?: boolean;
        skipped?: boolean;
        variant?: string;
        emailId?: string;
        error?: string;
        details?: unknown;
      };

      if (emailData.skipped) {
        emailResult.sent = false;
        emailResult.skipped = true;
      } else {
        emailResult.sent = true;
        emailResult.variant = emailData.variant;
        emailResult.emailId = emailData.emailId;
      }
    } catch (err: unknown) {
      emailResult.sent = false;
      emailResult.error = err instanceof Error ? err.message : "Email fetch failed";
    }
  } else {
    emailResult.skipped = true;
    emailResult.error = "No customer email — email not sent";
  }

  return {
    ok: true,
    body: {
      success: true,
      order,
      customer: {
        id: customer.id,
        name: `${customer.first_name} ${customer.last_name ?? ""}`.trim(),
        isNew: isNewCustomer,
        total_dropoffs: newTotalDropoffs,
      },
      email: emailResult,
    },
  };
}
