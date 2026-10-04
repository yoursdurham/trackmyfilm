import {
  getCustomerById,
  getOrderById,
  getOrderByNumber,
  updateCustomer,
  updateOrder,
} from "@/lib/db";
import { ORDER_STATUS } from "@/lib/constants";
import { sendOrderEmail } from "@/lib/email-service";
import {
  createTrackMyFilmOrder,
  deriveOrderFilmProcess,
  squarespaceImportToCreateInput,
} from "@/lib/order-create-service";
import {
  isPendingIntakeOrder,
  type PendingIntakeOrderEdits,
  type SquarespaceImportInput,
} from "@/lib/pending-intake";
import {
  normalizeEmail,
  normalizeFilmType,
  normalizeOrderNumber,
  validateRollDetails,
  isValidEmail,
} from "@/lib/validation";
import type { FilmOrder, FilmProcess } from "@/lib/types";

export type ImportSquarespaceResult =
  | { success: true; order: FilmOrder; customerId: string; createdCustomer: boolean }
  | { success: false; error: string; status?: number };

export async function importSquarespaceOrder(
  input: SquarespaceImportInput
): Promise<ImportSquarespaceResult> {
  if (!input.external_order_id?.trim()) {
    return { success: false, error: "external_order_id is required", status: 400 };
  }

  const result = await createTrackMyFilmOrder(squarespaceImportToCreateInput(input), {
    intake_mode: "pending_import",
    send_email: false,
  });

  if (!result.success) {
    return { success: false, error: result.error, status: result.status };
  }

  return {
    success: true,
    order: result.order,
    customerId: result.customer.id,
    createdCustomer: result.createdCustomer,
  };
}

export type ApprovePendingIntakeResult =
  | {
      success: true;
      order: FilmOrder;
      email_sent: boolean;
      email_skipped?: boolean;
      email_error?: string;
    }
  | { success: false; error: string; status?: number };

function buildPendingPatch(
  order: FilmOrder,
  edits: PendingIntakeOrderEdits
): { ok: true; patch: Partial<FilmOrder> } | { ok: false; error: string; status: number } {
  const rollDetailsError = validateRollDetails(edits.roll_details);
  if (rollDetailsError) {
    return { ok: false, error: rollDetailsError, status: 400 };
  }

  const patch: Partial<FilmOrder> = {};

  if (edits.order_number?.trim()) {
    patch.order_number = normalizeOrderNumber(edits.order_number);
  }
  if (edits.customer_name?.trim()) patch.customer_name = edits.customer_name.trim();
  if (edits.customer_email?.trim()) {
    const normalized = normalizeEmail(edits.customer_email);
    if (!isValidEmail(normalized)) {
      return { ok: false, error: "Invalid customer email", status: 400 };
    }
    patch.customer_email = normalized;
  }
  if (edits.dropoff_date) patch.dropoff_date = edits.dropoff_date;
  if (edits.roll_count != null) patch.roll_count = edits.roll_count;
  if (edits.film_type) {
    const ft = normalizeFilmType(edits.film_type);
    if (!ft) return { ok: false, error: "Invalid film_type", status: 400 };
    patch.film_type = ft;
  }
  if (edits.film_process) patch.film_process = edits.film_process as FilmProcess;
  if (edits.film_stock !== undefined) patch.film_stock = edits.film_stock || undefined;
  if (edits.roll_details) {
    patch.roll_details = edits.roll_details.map((roll) => ({
      ...roll,
      film_type: normalizeFilmType(roll.film_type) ?? roll.film_type,
    }));
    patch.film_process = deriveOrderFilmProcess(patch.roll_details, order.film_process);
  }
  if (edits.prints_4x6 !== undefined) patch.prints_4x6 = edits.prints_4x6;
  if (edits.notes !== undefined) patch.notes = edits.notes ?? undefined;

  return { ok: true, patch };
}

export async function approvePendingIntakeOrder(
  orderId: string,
  edits: PendingIntakeOrderEdits = {},
  options: { send_email?: boolean } = {}
): Promise<ApprovePendingIntakeResult> {
  const sendEmail = options.send_email !== false;

  const order = await getOrderById(orderId);
  if (!order) {
    return { success: false, error: "Order not found", status: 404 };
  }
  if (!isPendingIntakeOrder(order)) {
    return { success: false, error: "Order is not in Pending Intake", status: 400 };
  }

  const patchResult = buildPendingPatch(order, edits);
  if (!patchResult.ok) {
    return { success: false, error: patchResult.error, status: patchResult.status };
  }

  if (patchResult.patch.order_number) {
    const conflict = await getOrderByNumber(patchResult.patch.order_number);
    if (conflict && conflict.id !== orderId) {
      return {
        success: false,
        error: `Order number ${patchResult.patch.order_number} already exists`,
        status: 409,
      };
    }
  }

  if (Object.keys(patchResult.patch).length > 0) {
    await updateOrder(orderId, patchResult.patch);
  }

  const refreshed = await getOrderById(orderId);
  if (!refreshed) {
    return { success: false, error: "Order not found after save", status: 500 };
  }

  const customer = refreshed.customer_id
    ? await getCustomerById(refreshed.customer_id)
    : null;

  const newTotalDropoffs = (customer?.total_dropoffs || 0) + 1;
  const newTotalRolls = (customer?.total_rolls || 0) + (refreshed.roll_count || 0);

  const now = new Date().toISOString();

  const receivedOrder = await updateOrder(orderId, {
    pending_intake: false,
    status: ORDER_STATUS.RECEIVED_BY_YOURS,
    status_history: [{ status: ORDER_STATUS.RECEIVED_BY_YOURS, changed_at: now }],
    status_updated_at: now,
    received_by_yours_at: now,
    dropoff_number: newTotalDropoffs,
  });

  if (customer) {
    try {
      await updateCustomer(customer.id, {
        total_rolls: newTotalRolls,
        total_dropoffs: newTotalDropoffs,
        last_order_number: receivedOrder.order_number,
        current_rolls: refreshed.roll_count,
        last_dropoff_date: receivedOrder.dropoff_date,
      });
    } catch (err) {
      console.error("[approvePendingIntake] customer totals update failed:", err);
    }
  }

  if (!sendEmail) {
    return { success: true, order: receivedOrder, email_sent: false, email_skipped: true };
  }

  try {
    const emailData = await sendOrderEmail(orderId, "film_drop_received");
    const skipped = Boolean((emailData as { skipped?: boolean }).skipped);
    return {
      success: true,
      order: receivedOrder,
      email_sent: !skipped,
      email_skipped: skipped,
    };
  } catch (err: unknown) {
    return {
      success: true,
      order: receivedOrder,
      email_sent: false,
      email_error: err instanceof Error ? err.message : "Email failed",
    };
  }
}

export async function updatePendingIntakeOrder(
  orderId: string,
  edits: PendingIntakeOrderEdits
): Promise<{ success: true; order: FilmOrder } | { success: false; error: string; status?: number }> {
  const order = await getOrderById(orderId);
  if (!order) return { success: false, error: "Order not found", status: 404 };
  if (!isPendingIntakeOrder(order)) {
    return { success: false, error: "Only pending intake orders can be edited here", status: 400 };
  }

  const patchResult = buildPendingPatch(order, edits);
  if (!patchResult.ok) {
    return { success: false, error: patchResult.error, status: patchResult.status };
  }

  if (patchResult.patch.order_number) {
    const conflict = await getOrderByNumber(patchResult.patch.order_number);
    if (conflict && conflict.id !== orderId) {
      return {
        success: false,
        error: `Order number ${patchResult.patch.order_number} already exists`,
        status: 409,
      };
    }
  }

  const updated = await updateOrder(orderId, patchResult.patch);
  return { success: true, order: updated };
}
