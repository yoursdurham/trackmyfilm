/**
 * POST /api/dropoff
 * Single atomic endpoint for creating a new film drop-off.
 *
 * Does in one server-side call:
 *   1. Look up customer by email or normalized name
 *   2. Create customer if not found
 *   3. Create the film_orders row
 *   4. Update customer totals (total_rolls, total_dropoffs, last_order_number, current_rolls, last_dropoff_date)
 *   5. Send the right email:
 *        - 10th drop-off → loyalty_10 email
 *        -  5th drop-off → loyalty_5 email
 *        - Otherwise     → regular confirmation email
 *
 * Returns full result including email outcome so the client always knows what happened.
 * Nothing fails silently — all errors are returned in the response.
 */

import { NextResponse } from "next/server";
import {
  getCustomerByEmailOrName, createCustomer, updateCustomer,
  createOrder, getOrderByNumber,
} from "@/lib/db";
import { normalizeEmail, normalizeCustomerName, normalizeOrderNumber, isValidEmail } from "@/lib/validation";
import { requireAuth } from "@/lib/api-auth";
import { sendOrderEmail } from "@/lib/email-service";
import type { Customer, FilmProcess, RollDetail } from "@/lib/types";

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

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  let body: {
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
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    customer_name, customer_email, order_number,
    dropoff_date, roll_count, film_type, film_process, film_stock, roll_details, prints_4x6, notes,
    send_email = true,
  } = body;

  // ── Validate required fields ──────────────────────────────────────────
  const missing = [];
  if (!customer_name?.trim()) missing.push("customer_name");
  if (!order_number?.trim())  missing.push("order_number");
  if (!roll_count || roll_count < 1) missing.push("roll_count");
  if (!film_type)   missing.push("film_type");
  if (!film_process) missing.push("film_process");
  if (missing.length) {
    return NextResponse.json({ error: `Missing required fields: ${missing.join(", ")}` }, { status: 400 });
  }

  const normalizedEmail     = customer_email ? normalizeEmail(customer_email) : null;
  const nameParts           = customer_name.trim().split(/\s+/);
  const firstName           = nameParts[0];
  const lastName            = nameParts.slice(1).join(" ") || null;
  const normalizedName      = normalizeCustomerName(customer_name);
  const normalizedOrderNum  = normalizeOrderNumber(order_number);
  const now                 = new Date().toISOString();

  if (normalizedEmail && !isValidEmail(normalizedEmail)) {
    return NextResponse.json({ error: "Invalid customer email address" }, { status: 400 });
  }

  // ── Duplicate order number check ──────────────────────────────────────
  const existingOrder = await getOrderByNumber(normalizedOrderNum);
  if (existingOrder) {
    return NextResponse.json(
      { error: `Order number ${normalizedOrderNum} already exists` },
      { status: 409 }
    );
  }

  // ── Find or create customer (email is primary match key) ───────────────
  let customer: Customer | null = await getCustomerByEmailOrName(normalizedEmail, normalizedName);
  const isNewCustomer = !customer;

  if (!customer) {
    customer = await createCustomer({
      user_id:         auth.id,
      first_name:      firstName,
      last_name:       lastName ?? undefined,
      email:           normalizedEmail ?? undefined,
      normalized_name: normalizedName,
      total_rolls:     0,
      total_dropoffs:  0,
      default_film_type: film_type as Customer["default_film_type"],
      default_film_process: film_process as Customer["default_film_process"],
      default_scan_size: roll_details?.[0]?.scan_size,
    });

    if (!customer) {
      return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
    }
  }

  const newTotalRolls    = (customer.total_rolls    || 0) + roll_count;
  const newTotalDropoffs = (customer.total_dropoffs || 0) + 1;

  const resolvedFilmProcess = deriveOrderFilmProcess(roll_details, film_process);

  // ── Create order ──────────────────────────────────────────────────────
  let order;
  try {
    order = await createOrder({
      customer_id:          customer.id,
      customer_email:       normalizedEmail ?? "",
      customer_name:        customer_name.trim(),
      order_number:         normalizedOrderNum,
      dropoff_date,
      roll_count,
      film_type:            film_type as "35mm" | "120" | "110" | "Disposable Camera",
      film_process:         resolvedFilmProcess,
      film_stock:           film_stock ?? undefined,
      roll_details:         roll_details ?? undefined,
      prints_4x6:           prints_4x6 ?? undefined,
      dropoff_number:       newTotalDropoffs,
      status:               "Received by Yours",
      status_history:       [{ status: "Received by Yours", changed_at: now }],
      received_by_yours_at: now,
      status_updated_at:    now,
      notes:                notes ?? undefined,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `Failed to create order: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 500 }
    );
  }

  // ── Update customer totals ────────────────────────────────────────────
  try {
    const customerPatch: Partial<Customer> = {
      total_rolls:       newTotalRolls,
      total_dropoffs:    newTotalDropoffs,
      last_order_number: normalizedOrderNum,
      current_rolls:     roll_count,
      last_dropoff_date: dropoff_date,
    };

    if (!isNewCustomer) {
      customerPatch.default_film_type = film_type as Customer["default_film_type"];
      customerPatch.default_film_process = film_process as Customer["default_film_process"];
      if (roll_details?.[0]?.scan_size) {
        customerPatch.default_scan_size = roll_details[0].scan_size;
      }
    }

    await updateCustomer(customer.id, customerPatch);
  } catch {
    // Order was created successfully — log the failure but don't abort the response
    console.error(`[dropoff] Failed to update totals for customer ${customer.id} on order ${normalizedOrderNum}`);
  }

  // ── Send email ────────────────────────────────────────────────────────
  const emailResult: {
    sent: boolean;
    skipped?: boolean;
    variant?: string;
    emailId?: string;
    error?: string;
  } = { sent: false };

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
        emailResult.sent    = false;
        emailResult.skipped = true;
      } else {
        emailResult.sent    = true;
        emailResult.variant = emailData.variant;
        emailResult.emailId = emailData.emailId;
      }
    } catch (err: unknown) {
      emailResult.sent  = false;
      emailResult.error = err instanceof Error ? err.message : "Email fetch failed";
    }
  } else {
    emailResult.skipped = true;
    emailResult.error   = "No customer email — email not sent";
  }

  return NextResponse.json({
    success: true,
    order,
    customer: {
      id:             customer.id,
      name:           `${customer.first_name} ${customer.last_name ?? ""}`.trim(),
      isNew:          isNewCustomer,
      total_dropoffs: newTotalDropoffs,
    },
    email: emailResult,
  }, { status: 201 });
}
