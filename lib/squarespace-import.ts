/**
 * Writes classified Squarespace orders into incoming_squarespace_drafts.
 * Creates Pending Intake rows only, and only for orders placed within the
 * lookback. Does not create film orders, send email, or change drafts and
 * film orders that are already stored.
 */

import type { IncomingDraftInput } from "./incoming-drafts";
import {
  classifySquarespaceOrder,
  emptySquarespaceCheckSummary,
  selectSquarespaceOrdersForIntake,
  type SquarespaceCheckSummary,
} from "./squarespace-orders";

export interface SquarespaceImportDeps {
  orderNumberExists: (orderNumber: string) => Promise<boolean>;
  getIncomingDraftByOrderNumber: (orderNumber: string) => Promise<unknown>;
  getIncomingDraftByExternalId: (externalOrderId: string) => Promise<unknown>;
  createIncomingDraft: (data: IncomingDraftInput) => Promise<unknown>;
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: string }).code ?? "") : "";
  const message = err instanceof Error ? err.message : "";
  return code === "23505" || message.toLowerCase().includes("duplicate key");
}

export async function importSquarespaceOrders(
  orders: unknown[],
  deps: SquarespaceImportDeps,
  now: Date = new Date(),
): Promise<SquarespaceCheckSummary> {
  const summary = emptySquarespaceCheckSummary();
  const selected = selectSquarespaceOrdersForIntake(orders, now);
  summary.errors.push(...selected.invalid);

  for (const order of selected.orders) {
    const classified = classifySquarespaceOrder(order);
    if (classified.kind === "skip_pos") {
      summary.skippedPos += 1;
      continue;
    }
    if (classified.kind === "skip_no_film") {
      summary.skippedNoFilm += 1;
      continue;
    }
    if (classified.kind === "error") {
      summary.errors.push({
        orderNumber: classified.orderNumber,
        message: classified.message,
      });
      continue;
    }

    const draft = classified.draft;
    try {
      const [orderExists, draftByNumber, draftByExternalId] = await Promise.all([
        deps.orderNumberExists(draft.squarespace_order_number),
        deps.getIncomingDraftByOrderNumber(draft.squarespace_order_number),
        deps.getIncomingDraftByExternalId(draft.external_order_id),
      ]);
      if (orderExists || draftByNumber || draftByExternalId) {
        summary.skippedDuplicate += 1;
        continue;
      }
      await deps.createIncomingDraft(draft);
      summary.imported += 1;
      summary.importedOrderNumbers.push(draft.squarespace_order_number);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        summary.skippedDuplicate += 1;
        continue;
      }
      const message = err instanceof Error ? err.message : "Failed to save draft";
      summary.errors.push({
        orderNumber: draft.squarespace_order_number,
        message,
      });
    }
  }

  return summary;
}
