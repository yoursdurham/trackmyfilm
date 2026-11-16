/**
 * Reward ledger operations. The database and Squarespace are injected
 * so tests can run the same issuing and cleanup steps.
 */

import { randomInt, randomUUID } from "node:crypto";
import {
  buildRewardDiscountRequest,
  earnRollsForOrder,
  expireIdempotencyKey,
  generateRewardPromoCode,
  orderEarnIdempotencyKey,
  planDiscountCleanup,
  planRewardRows,
  redeemIdempotencyKey,
  restoreIdempotencyKey,
  rewardBalance,
  rewardValidTo,
  type CleanupAction,
  type DiscountSnapshot,
  type IssuedRewardSnapshot,
  type RewardChannel,
  type RewardOrder,
  type RewardStatus,
} from "@/lib/rewards";
import { ORDER_STATUS } from "@/lib/constants";
import { SquarespaceDiscountError } from "@/lib/squarespace-discounts";

export type RewardRecord = {
  id: string;
  customerId: string;
  status: RewardStatus;
  sequence: number;
  promoCode: string | null;
  squarespaceDiscountId: string | null;
  validTo: string | null;
  redeemedOrder: string | null;
  redeemedRollIndex: number | null;
  redeemedVia: RewardChannel | null;
  createdAt: string;
};

export type RewardEventRecord = {
  id: string;
  customerId: string;
  kind: string;
  rolls: number;
  orderId: string | null;
  rewardId: string | null;
  reason: string | null;
  idempotencyKey: string;
  createdAt: string;
};

export type EarnWrite = {
  customerId: string;
  orderId: string;
  rolls: number;
  idempotencyKey: string;
  reason: string;
};

export type EventWrite = {
  customerId: string;
  kind: "redeem" | "expire" | "restore" | "adjust";
  rolls: number;
  orderId: string | null;
  rewardId: string | null;
  reason: string | null;
  idempotencyKey: string;
};

export interface RewardRepository {
  listEvents(customerId: string): Promise<RewardEventRecord[]>;
  upsertEarns(rows: EarnWrite[]): Promise<void>;
  listRewards(customerId: string): Promise<RewardRecord[]>;
  listIssuedAndRedeemed(): Promise<RewardRecord[]>;
  getReward(id: string): Promise<RewardRecord | null>;
  insertReward(customerId: string, sequence: number): Promise<RewardRecord>;
  deleteRewards(ids: string[]): Promise<void>;
  updateReward(
    id: string,
    patch: Partial<Pick<RewardRecord,
      "status" | "promoCode" | "squarespaceDiscountId" | "validTo" | "redeemedOrder" | "redeemedRollIndex" | "redeemedVia">>,
    expectedStatuses: RewardStatus[],
  ): Promise<RewardRecord | null>;
  insertEvent(event: EventWrite): Promise<"inserted" | "exists">;
  findByPromoCode(code: string): Promise<RewardRecord | null>;
  listImportedPromoCodes(): Promise<string[]>;
  /** Orders already finished when rewards began. They must not earn again. */
  legacyOrderIds(orderIds: readonly string[]): Promise<string[]>;
}

export interface DiscountClient {
  createDiscount(body: Record<string, unknown>): Promise<{ id: string; promoCode: string }>;
  deleteDiscount(id: string): Promise<void>;
}

export function earnReason(order: RewardOrder): string {
  if (order.status === ORDER_STATUS.READY_FOR_PICKUP) {
    return "Counted when the process-only order was ready for pickup";
  }
  return "Counted when scans were sent";
}

export function earnWritesForOrders(
  orders: readonly RewardOrder[],
  existingKeys: ReadonlySet<string>,
  legacyOrderIds: ReadonlySet<string> = new Set(),
): EarnWrite[] {
  const writes: EarnWrite[] = [];
  for (const order of orders) {
    if (!order.id || !order.customer_id) continue;
    const idempotencyKey = orderEarnIdempotencyKey(order.id);
    // A historical order keeps its capped backfill credit. Do not open an
    // earn row for it, and zero one if a previous sync wrote the full count.
    const rolls = legacyOrderIds.has(order.id) ? 0 : earnRollsForOrder(order);
    if (rolls === 0 && !existingKeys.has(idempotencyKey)) continue;
    writes.push({
      customerId: order.customer_id,
      orderId: order.id,
      rolls,
      idempotencyKey,
      reason: rolls === 0
        ? "This order was finished before rewards and stays in the starting credit."
        : earnReason(order),
    });
  }
  return writes;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = error instanceof Error ? error.message : "";
  return code === "23505" || message.toLowerCase().includes("duplicate key");
}

export async function reconcileCustomer(repo: RewardRepository, customerId: string): Promise<RewardRecord[]> {
  const events = await repo.listEvents(customerId);
  const owed = rewardBalance(events).rewardsOwed;
  const rewards = await repo.listRewards(customerId);
  const plan = planRewardRows(rewards, owed);
  if (plan.deleteIds.length > 0) await repo.deleteRewards(plan.deleteIds);
  for (const sequence of plan.createSequences) {
    try {
      await repo.insertReward(customerId, sequence);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  return repo.listRewards(customerId);
}

export async function syncOrderEarns(
  repo: RewardRepository,
  orders: readonly RewardOrder[],
): Promise<void> {
  const customerIds = [...new Set(orders.map((order) => order.customer_id).filter((id): id is string => Boolean(id)))];
  const existingKeys = new Set<string>();
  for (const customerId of customerIds) {
    const events = await repo.listEvents(customerId);
    for (const event of events) {
      if (event.kind === "earn") existingKeys.add(event.idempotencyKey);
    }
  }
  const legacy = new Set(await repo.legacyOrderIds(orders.map((order) => order.id)));
  const writes = earnWritesForOrders(orders, existingKeys, legacy);
  if (writes.length > 0) await repo.upsertEarns(writes);
  for (const customerId of customerIds) {
    await reconcileCustomer(repo, customerId);
  }
}

export type IssueCodeResult =
  | { ok: true; code: string; validTo: string; alreadyIssued: boolean; rewardId: string }
  | { ok: false; error: string };

export async function issueOnlineCode(
  repo: RewardRepository,
  discounts: DiscountClient,
  input: {
    rewardId: string;
    productIds: readonly string[];
    now?: Date;
    randomInt?: (exclusiveMax: number) => number;
  },
): Promise<IssueCodeResult> {
  const now = input.now ?? new Date();
  const roll = input.randomInt ?? randomInt;
  if (input.productIds.length === 0) {
    return { ok: false, error: "Online codes need the dev and high-res scan products connected." };
  }

  const current = await repo.getReward(input.rewardId);
  if (!current) return { ok: false, error: "That reward is not on your account." };
  if (current.status === "issued" && current.promoCode && current.validTo) {
    return {
      ok: true,
      code: current.promoCode,
      validTo: current.validTo,
      alreadyIssued: true,
      rewardId: current.id,
    };
  }
  if (current.status !== "earned") {
    return { ok: false, error: "That reward is no longer available." };
  }

  const validTo = rewardValidTo(now);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const promoCode = generateRewardPromoCode(roll);
    if (await repo.findByPromoCode(promoCode)) continue;
    let created: { id: string; promoCode: string };
    try {
      created = await discounts.createDiscount(buildRewardDiscountRequest({
        promoCode,
        productIds: input.productIds,
        validFrom: now,
        validTo,
      }));
    } catch (error) {
      if (error instanceof SquarespaceDiscountError && error.status === 409) continue;
      const message = error instanceof Error ? error.message : "Squarespace could not create the code.";
      return { ok: false, error: message };
    }

    const saved = await repo.updateReward(current.id, {
      status: "issued",
      promoCode: created.promoCode,
      squarespaceDiscountId: created.id,
      validTo: validTo.toISOString(),
    }, ["earned"]);

    if (saved) {
      return {
        ok: true,
        code: saved.promoCode ?? created.promoCode,
        validTo: saved.validTo ?? validTo.toISOString(),
        alreadyIssued: false,
        rewardId: saved.id,
      };
    }

    try {
      await discounts.deleteDiscount(created.id);
    } catch (error) {
      console.error("[rewards] Could not delete a discount that lost the race:", error instanceof Error ? error.message : error);
    }
    const winner = await repo.getReward(current.id);
    if (winner?.status === "issued" && winner.promoCode && winner.validTo) {
      return {
        ok: true,
        code: winner.promoCode,
        validTo: winner.validTo,
        alreadyIssued: true,
        rewardId: winner.id,
      };
    }
    return { ok: false, error: "That reward is no longer available." };
  }

  return { ok: false, error: "Squarespace could not create a unique code. Try again." };
}

async function writeOnce(repo: RewardRepository, event: EventWrite): Promise<void> {
  await repo.insertEvent(event);
}

export async function markRewardRedeemed(
  repo: RewardRepository,
  discounts: DiscountClient | null,
  input: {
    rewardId: string;
    via: RewardChannel;
    orderId?: string | null;
    rollIndex?: number | null;
    discountId?: string | null;
  },
): Promise<{ ok: true; already: boolean } | { ok: false; error: string }> {
  const reward = await repo.getReward(input.rewardId);
  if (!reward) return { ok: false, error: "That reward is not on this customer's account." };
  if (reward.status === "redeemed") return { ok: true, already: true };
  if (reward.status !== "earned" && reward.status !== "issued") {
    return { ok: false, error: "That reward is no longer available." };
  }

  const discountId = input.discountId ?? reward.squarespaceDiscountId;
  if (input.via === "in_store" && reward.status === "issued") {
    if (!discounts || !discountId) {
      return { ok: false, error: "This reward has an online code, and Squarespace is not connected, so the code cannot be voided yet." };
    }
  }
  if (input.via === "in_store" && reward.status === "issued" && discountId && discounts) {
    try {
      await discounts.deleteDiscount(discountId);
    } catch (error) {
      if (!(error instanceof SquarespaceDiscountError) || error.status !== 404) {
        const message = error instanceof Error ? error.message : "Could not void the online code.";
        return { ok: false, error: message };
      }
    }
  }

  const saved = await repo.updateReward(reward.id, {
    status: "redeemed",
    redeemedVia: input.via,
    redeemedOrder: input.orderId ?? reward.redeemedOrder,
    redeemedRollIndex: input.rollIndex ?? reward.redeemedRollIndex,
    promoCode: input.via === "in_store" ? null : reward.promoCode,
    squarespaceDiscountId: null,
    validTo: input.via === "in_store" ? null : reward.validTo,
  }, ["earned", "issued"]);

  if (!saved && (await repo.getReward(reward.id))?.status !== "redeemed") {
    return { ok: false, error: "That reward is no longer available." };
  }

  await writeOnce(repo, {
    customerId: reward.customerId,
    kind: "redeem",
    rolls: 0,
    orderId: input.orderId ?? null,
    rewardId: reward.id,
    reason: input.via === "in_store" ? "Redeemed in the shop" : "Online code used",
    idempotencyKey: redeemIdempotencyKey(reward.id),
  });

  if (input.via === "online" && discountId && discounts) {
    try {
      await discounts.deleteDiscount(discountId);
    } catch (error) {
      console.error("[rewards] Spent discount was not deleted:", error instanceof Error ? error.message : error);
    }
  }
  return { ok: true, already: !saved };
}

export async function restoreUnusedReward(
  repo: RewardRepository,
  discounts: DiscountClient | null,
  input: { rewardId: string; discountId: string | null; validTo: string },
): Promise<void> {
  const reward = await repo.getReward(input.rewardId);
  if (!reward || reward.status === "redeemed") return;
  const discountId = input.discountId ?? reward.squarespaceDiscountId;
  if (reward.status === "issued") {
    const saved = await repo.updateReward(reward.id, {
      status: "earned",
      promoCode: null,
      squarespaceDiscountId: null,
      validTo: null,
    }, ["issued"]);
    if (saved) {
      await writeOnce(repo, {
        customerId: reward.customerId,
        kind: "expire",
        rolls: 0,
        orderId: null,
        rewardId: reward.id,
        reason: "Unused online code expired",
        idempotencyKey: expireIdempotencyKey(reward.id, input.validTo),
      });
      await writeOnce(repo, {
        customerId: reward.customerId,
        kind: "restore",
        rolls: 0,
        orderId: null,
        rewardId: reward.id,
        reason: "Reward returned to the account",
        idempotencyKey: restoreIdempotencyKey(reward.id, input.validTo),
      });
    }
  }
  if (discountId && discounts) {
    const latest = await repo.getReward(input.rewardId);
    if (latest && latest.squarespaceDiscountId && latest.squarespaceDiscountId !== discountId) return;
    try {
      await discounts.deleteDiscount(discountId);
    } catch (error) {
      if (!(error instanceof SquarespaceDiscountError) || error.status !== 404) throw error;
    }
  }
}

export async function adjustCustomerRolls(
  repo: RewardRepository,
  input: { customerId: string; rolls: number; reason: string },
): Promise<void> {
  await repo.insertEvent({
    customerId: input.customerId,
    kind: "adjust",
    rolls: input.rolls,
    orderId: null,
    rewardId: null,
    reason: input.reason,
    idempotencyKey: `adjust:${randomUUID()}`,
  });
  await reconcileCustomer(repo, input.customerId);
}

export function issuedSnapshots(rewards: readonly RewardRecord[]): IssuedRewardSnapshot[] {
  return rewards.map((reward) => ({
    id: reward.id,
    promoCode: reward.promoCode,
    squarespaceDiscountId: reward.squarespaceDiscountId,
    validTo: reward.validTo,
    status: reward.status,
  }));
}

export async function applyDiscountCleanup(
  repo: RewardRepository,
  discounts: DiscountClient,
  input: {
    squarespaceDiscounts: readonly DiscountSnapshot[];
    now?: Date;
  },
): Promise<{ redeemed: number; restored: number; deleted: number }> {
  const now = input.now ?? new Date();
  const [rewards, importedPromoCodes] = await Promise.all([
    repo.listIssuedAndRedeemed(),
    repo.listImportedPromoCodes(),
  ]);
  const actions = planDiscountCleanup({
    discounts: input.squarespaceDiscounts,
    rewards: issuedSnapshots(rewards),
    importedPromoCodes,
    now,
  });
  return applyCleanupActions(repo, discounts, actions);
}

export async function applyCleanupActions(
  repo: RewardRepository,
  discounts: DiscountClient,
  actions: readonly CleanupAction[],
): Promise<{ redeemed: number; restored: number; deleted: number }> {
  let redeemed = 0;
  let restored = 0;
  let deleted = 0;
  for (const action of actions) {
    if (action.type === "redeem_online") {
      const result = await markRewardRedeemed(repo, discounts, {
        rewardId: action.rewardId,
        via: "online",
        discountId: action.discountId,
      });
      if (result.ok) redeemed += 1;
      continue;
    }
    if (action.type === "restore") {
      await restoreUnusedReward(repo, discounts, action);
      restored += 1;
      continue;
    }
    await discounts.deleteDiscount(action.discountId);
    deleted += 1;
  }
  return { redeemed, restored, deleted };
}

export async function linkImportedCodeToOrder(
  repo: RewardRepository,
  discounts: DiscountClient | null,
  input: { orderId: string; promoCodes: readonly string[] },
): Promise<void> {
  for (const code of input.promoCodes) {
    const reward = await repo.findByPromoCode(code);
    if (!reward) continue;
    if (reward.status === "issued") {
      await markRewardRedeemed(repo, discounts, {
        rewardId: reward.id,
        via: "online",
        orderId: input.orderId,
        discountId: reward.squarespaceDiscountId,
      });
      continue;
    }
    if (reward.status === "redeemed" && !reward.redeemedOrder) {
      await repo.updateReward(reward.id, { redeemedOrder: input.orderId }, ["redeemed"]);
    }
  }
}
