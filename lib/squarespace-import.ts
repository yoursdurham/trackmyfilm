/**
 * Writes classified Squarespace orders into incoming_squarespace_drafts.
 * Creates Pending Intake rows only, and only for orders placed within the
 * lookback. Does not create film orders or send email. A dismissed or
 * accepted draft blocks a second import of the same Squarespace order id,
 * or the same order number after leading-zero normalization.
 * A Pending Intake row can be filled in on a later check with the customer's
 * film-type answer, matched stocks, and a Yes print choice.
 */

import { CUSTOMER_FILM_NOTE_PREFIX, mergeCustomerFilmNote } from "./film-stock-match";
import {
  PENDING_INTAKE_STATUS,
  squarespaceDraftBlocksImport,
  type IncomingDraftInput,
} from "./incoming-drafts";
import {
  classifySquarespaceOrder,
  emptySquarespaceCheckSummary,
  selectSquarespaceOrdersForIntake,
  type SquarespaceCheckSummary,
} from "./squarespace-orders";
import type { RollDetail } from "./types";

export interface PendingDraftFilmPatch {
  squarespace_film_listing?: string;
  roll_details?: RollDetail[];
  notes?: string | null;
}

export interface PendingDraftFilmBackfill extends PendingDraftFilmPatch {
  id: string;
}

export interface SquarespaceImportDeps {
  orderNumberExists: (orderNumber: string) => Promise<boolean>;
  getIncomingDraftByOrderNumber: (orderNumber: string) => Promise<unknown>;
  getIncomingDraftByExternalId: (externalOrderId: string) => Promise<unknown>;
  createIncomingDraft: (data: IncomingDraftInput) => Promise<unknown>;
  /** Fills a Pending Intake row. Omitted in tests that only cover new imports. */
  updatePendingIncomingDraft?: (id: string, patch: PendingDraftFilmPatch) => Promise<unknown>;
}

function customerFilmNoteLine(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const line = notes
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith(CUSTOMER_FILM_NOTE_PREFIX.toLowerCase()));
  return line ?? null;
}

function mergeBackfillRolls(existingRolls: unknown, incomingRolls: RollDetail[]): RollDetail[] | null {
  if (!Array.isArray(existingRolls) || existingRolls.length !== incomingRolls.length) return null;
  let changed = false;
  const next = existingRolls.map((value, index) => {
    const roll = (value && typeof value === "object" ? { ...value } : {}) as RollDetail;
    const incoming = incomingRolls[index];
    const stock = typeof roll.film_stock === "string" ? roll.film_stock.trim() : "";
    if (!stock && incoming?.film_stock) {
      roll.film_stock = incoming.film_stock;
      changed = true;
    }
    const incomingPrints = incoming?.prints_4x6 === true;
    const existingPrints = roll.prints_4x6 === true;
    if (existingPrints !== incomingPrints) {
      roll.prints_4x6 = incomingPrints;
      changed = true;
    }
    return roll;
  });
  return changed ? next : null;
}

/**
 * Pending Intake rows imported before the film-type answer was captured can
 * receive it on the next Check Squarespace. Accepted and dismissed rows are
 * left alone. Returns null when the stored row already has the answer.
 */
export function pendingDraftFilmBackfill(
  existing: unknown,
  incoming: IncomingDraftInput,
): PendingDraftFilmBackfill | null {
  if (!existing || typeof existing !== "object") return null;
  const row = existing as {
    id?: unknown;
    status?: unknown;
    notes?: unknown;
    squarespace_film_listing?: unknown;
    roll_details?: unknown;
  };
  if (row.status !== PENDING_INTAKE_STATUS) return null;
  if (typeof row.id !== "string" || !row.id.trim()) return null;

  const patch: PendingDraftFilmBackfill = { id: row.id };
  const incomingListing = incoming.squarespace_film_listing?.trim() ?? "";
  const existingListing = typeof row.squarespace_film_listing === "string"
    ? row.squarespace_film_listing.trim()
    : "";
  if (incomingListing && incomingListing !== existingListing) {
    patch.squarespace_film_listing = incomingListing;
  }

  const mergedRolls = mergeBackfillRolls(row.roll_details, incoming.roll_details);
  if (mergedRolls) patch.roll_details = mergedRolls;

  const existingNotes = typeof row.notes === "string" ? row.notes : null;
  const mergedNotes = mergeCustomerFilmNote(existingNotes, customerFilmNoteLine(incoming.notes));
  if (mergedNotes && mergedNotes !== (existingNotes?.trim() ?? "")) {
    patch.notes = mergedNotes;
  }

  if (!patch.squarespace_film_listing && !patch.roll_details && patch.notes === undefined) {
    return null;
  }
  return patch;
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
      const blockedByDraft = squarespaceDraftBlocksImport(draftByNumber, draft)
        || squarespaceDraftBlocksImport(draftByExternalId, draft);
      if (orderExists || blockedByDraft) {
        if (!orderExists && deps.updatePendingIncomingDraft) {
          const backfill = pendingDraftFilmBackfill(draftByExternalId ?? draftByNumber, draft);
          if (backfill) {
            try {
              const { id, ...patch } = backfill;
              await deps.updatePendingIncomingDraft(id, patch);
              summary.updated += 1;
              summary.updatedOrderNumbers.push(draft.squarespace_order_number);
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : "Failed to update draft";
              summary.errors.push({
                orderNumber: draft.squarespace_order_number,
                message,
              });
            }
          }
        }
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
