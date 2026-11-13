/**
 * Customer rewards. Pure rules: which rolls count, the ledger balance,
 * Squarespace discount payload, and what the cleanup job should do.
 * No database and no network.
 */

import { ORDER_STATUS } from "@/lib/constants";
import { isProcessOnlyOrder } from "@/lib/order-service";

export const REWARD_ROLLS_PER_REWARD = 10;
/** Historical finished rolls start each customer at no more than this. */
export const HISTORICAL_STARTING_CREDIT_CAP = 5;
export const REWARD_CODE_PREFIX = "TMF-";
export const REWARD_VALID_DAYS = 90;
export const REWARD_DISCOUNT_NAME = "Yours, free dev + high-res scan";
export const REWARD_PRODUCT_IDS_ENV = "SQUARESPACE_REWARD_PRODUCT_IDS";
export const SQUARESPACE_DISCOUNTS_API_KEY_ENV = "SQUARESPACE_DISCOUNTS_API_KEY";
export const SQUARESPACE_DISCOUNTS_ENDPOINT = "https://api.squarespace.com/v1/commerce/discounts";

export const ONLINE_CODE_PAUSED_MESSAGE =
  "Online codes are paused until the shop connects Squarespace. Your reward stays on your account, and Yours, can apply it when you drop film off.";

export const ONLINE_PRODUCTS_MISSING_MESSAGE =
  "Online codes need the dev and high-res scan products connected. Yours, can still apply this reward in the shop.";

const QUALIFYING_FILM_TYPES = new Set(["35mm", "120", "Disposable Camera"]);
const PROMO_CODE_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;
const GIFT_CARD_CODE = /^GC[A-Za-z0-9]{14}$/i;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type RewardEventKind = "earn" | "redeem" | "expire" | "restore" | "adjust" | "backfill";
export type RewardStatus = "earned" | "issued" | "redeemed" | "expired";
export type RewardChannel = "online" | "in_store";

export type RewardOrder = {
  id: string;
  customer_id?: string | null;
  status?: string | null;
  film_type?: string | null;
  roll_count?: number | null;
  roll_details?: readonly { film_type?: string | null; blank?: unknown; scan_size?: string | null }[] | null;
  scan_size?: string | null;
  scan_type?: string | null;
  scan_option?: string | null;
  resolution?: string | null;
};

export type LedgerRoll = {
  kind: string;
  rolls: number;
};

export type RewardBalance = {
  netRolls: number;
  rewardsOwed: number;
  progress: number;
  progressTarget: number;
};

export type RewardRowPlan = {
  id: string;
  status: string;
  sequence: number;
};

/** A roll counts once the shop has finished it. */
export function orderEarnsRewards(order: RewardOrder): boolean {
  if (order.status === ORDER_STATUS.SCANS_SENT) return true;
  if (order.status === ORDER_STATUS.READY_FOR_PICKUP && isProcessOnlyOrder(order)) return true;
  return false;
}

/** 35mm, 120, and disposable rolls count, including rolls marked blank. 110 does not. */
export function isQualifyingRewardRoll(roll: { film_type?: string | null }): boolean {
  return !!roll.film_type && QUALIFYING_FILM_TYPES.has(roll.film_type);
}

/**
 * Qualifying rolls on this order. Per-roll details win. An order with no
 * roll list falls back to film_type and roll_count.
 */
export function qualifyingRollCount(order: Pick<RewardOrder, "film_type" | "roll_count" | "roll_details">): number {
  const details = order.roll_details;
  if (Array.isArray(details) && details.length > 0) {
    return details.filter((roll) => isQualifyingRewardRoll(roll)).length;
  }
  if (order.film_type && QUALIFYING_FILM_TYPES.has(order.film_type)) {
    const count = order.roll_count ?? 0;
    return Number.isInteger(count) && count > 0 ? count : 0;
  }
  return 0;
}

/** Rolls to store on the one earn row for this order. Zero when it should not count. */
export function earnRollsForOrder(order: RewardOrder): number {
  if (!order.customer_id) return 0;
  if (!orderEarnsRewards(order)) return 0;
  return qualifyingRollCount(order);
}

export function orderEarnIdempotencyKey(orderId: string): string {
  return `earn:order:${orderId}`;
}

export function backfillIdempotencyKey(customerId: string): string {
  return `backfill:customer:${customerId}`;
}

/**
 * Starting credit from rolls already finished when rewards began.
 * Five or more becomes 5. Under five stays as it is. Zero stays zero,
 * so history alone never reaches a reward.
 */
export function historicalStartingCredit(qualifyingRolls: number): number {
  if (!Number.isFinite(qualifyingRolls)) return 0;
  const rolls = Math.max(0, Math.trunc(qualifyingRolls));
  return Math.min(rolls, HISTORICAL_STARTING_CREDIT_CAP);
}

/** How many customers land on each starting balance. Rewards from history are always zero. */
export function historicalCreditDistribution(qualifyingTotals: readonly number[]): {
  customers: number;
  byStartingCredit: Record<0 | 1 | 2 | 3 | 4 | 5, number>;
  rewardsFromHistory: number;
} {
  const byStartingCredit = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const total of qualifyingTotals) {
    const credit = historicalStartingCredit(total) as 0 | 1 | 2 | 3 | 4 | 5;
    byStartingCredit[credit] += 1;
  }
  return {
    customers: qualifyingTotals.length,
    byStartingCredit,
    rewardsFromHistory: 0,
  };
}

export function redeemIdempotencyKey(rewardId: string): string {
  return `redeem:${rewardId}`;
}

export function expireIdempotencyKey(rewardId: string, validTo: string): string {
  return `expire:${rewardId}:${validTo}`;
}

export function restoreIdempotencyKey(rewardId: string, validTo: string): string {
  return `restore:${rewardId}:${validTo}`;
}

export function rewardBalance(events: readonly LedgerRoll[]): RewardBalance {
  const netRolls = events.reduce((sum, event) => {
    if (event.kind === "earn" || event.kind === "adjust" || event.kind === "backfill") return sum + event.rolls;
    return sum;
  }, 0);
  const safe = Math.max(0, Math.trunc(netRolls));
  return {
    netRolls,
    rewardsOwed: Math.floor(safe / REWARD_ROLLS_PER_REWARD),
    progress: safe % REWARD_ROLLS_PER_REWARD,
    progressTarget: REWARD_ROLLS_PER_REWARD,
  };
}

export function rewardProgressSentence(progress: number, target = REWARD_ROLLS_PER_REWARD): string {
  const rolls = Math.max(0, Math.trunc(progress));
  const goal = Math.max(1, Math.trunc(target));
  return `${rolls} of ${goal} rolls toward your next free dev + high-res scan`;
}

/** Caption under the punch card. A full card means a reward is ready to use. */
export function punchCardCaption(punched: number, total = REWARD_ROLLS_PER_REWARD): string {
  const goal = Math.max(1, Math.trunc(total));
  const count = Math.max(0, Math.min(goal, Math.trunc(Number.isFinite(punched) ? punched : 0)));
  if (count >= goal) return `${goal} of ${goal} — your free dev + high-res scan is ready`;
  const remaining = goal - count;
  const rolls = remaining === 1 ? "1 more roll" : `${remaining} more rolls`;
  return `${count} of ${goal} — ${rolls} until your free dev + high-res scan`;
}

/**
 * Keep exactly `owed` reward rows when we can. Issued and redeemed rows
 * stay. Extra unissued rows are removed from the highest sequence down.
 */
export function planRewardRows(rewards: readonly RewardRowPlan[], owed: number): {
  deleteIds: string[];
  createSequences: number[];
} {
  const target = Math.max(0, Math.trunc(owed));
  const sorted = [...rewards].sort((left, right) => left.sequence - right.sequence);
  if (sorted.length < target) {
    const max = sorted.reduce((highest, reward) => Math.max(highest, reward.sequence), 0);
    const createSequences: number[] = [];
    for (let index = sorted.length; index < target; index += 1) {
      createSequences.push(max + (index - sorted.length) + 1);
    }
    return { deleteIds: [], createSequences };
  }
  if (sorted.length === target) return { deleteIds: [], createSequences: [] };

  const deleteIds: string[] = [];
  let extra = sorted.length - target;
  for (const reward of [...sorted].reverse()) {
    if (extra <= 0) break;
    if (reward.status === "earned") {
      deleteIds.push(reward.id);
      extra -= 1;
    }
  }
  return { deleteIds, createSequences: [] };
}

export function isGiftCardShapedCode(code: string): boolean {
  return GIFT_CARD_CODE.test(code.replace(/-/g, "").trim());
}

export function isRewardPromoCode(code: string): boolean {
  const trimmed = code.trim();
  if (!PROMO_CODE_PATTERN.test(trimmed)) return false;
  if (isGiftCardShapedCode(trimmed)) return false;
  return trimmed.toUpperCase().startsWith(REWARD_CODE_PREFIX);
}

/** TMF- plus 6 letters or digits. The prefix cannot match a gift card code. */
export function generateRewardPromoCode(randomInt: (exclusiveMax: number) => number): string {
  let body = "";
  for (let index = 0; index < 6; index += 1) {
    body += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)] ?? "A";
  }
  const code = `${REWARD_CODE_PREFIX}${body}`;
  if (!isRewardPromoCode(code) || isGiftCardShapedCode(code)) {
    throw new Error("Generated reward code was not usable");
  }
  return code;
}

export function rewardValidTo(from: Date): Date {
  const next = new Date(from.getTime());
  next.setUTCDate(next.getUTCDate() + REWARD_VALID_DAYS);
  return next;
}

export function parseRewardProductIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of raw.split(/[\s,]+/)) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function resolveRewardProductIds(saved: readonly string[], envRaw: string | undefined): string[] {
  const fromSettings = saved.map((id) => id.trim()).filter((id) => /^[A-Za-z0-9_-]{1,80}$/.test(id));
  if (fromSettings.length > 0) return [...new Set(fromSettings)];
  return parseRewardProductIds(envRaw);
}

export function onlineCodeAvailability(input: {
  apiKey: string | undefined;
  productIds: readonly string[];
}): { enabled: true } | { enabled: false; message: string } {
  if (!input.apiKey?.trim()) return { enabled: false, message: ONLINE_CODE_PAUSED_MESSAGE };
  if (input.productIds.length === 0) return { enabled: false, message: ONLINE_PRODUCTS_MISSING_MESSAGE };
  return { enabled: true };
}

/**
 * One single-use code for the configured dev + high-res scan products.
 * Squarespace documents PRODUCT criteria with one productId. productIds
 * carries every configured id (35mm, 120, disposable) on the same code.
 * maxApplicationsPerCart keeps the code to one roll. Percentage discounts
 * apply to the subtotal, and checkout accepts one promo code.
 */
export function buildRewardDiscountRequest(input: {
  promoCode: string;
  productIds: readonly string[];
  validFrom: Date;
  validTo: Date;
}): Record<string, unknown> {
  const productIds = [...input.productIds];
  if (productIds.length === 0) throw new Error("A reward code needs at least one product");
  if (!isRewardPromoCode(input.promoCode)) throw new Error("Reward code is not a TMF promo code");
  return {
    name: REWARD_DISCOUNT_NAME,
    validFrom: input.validFrom.toISOString(),
    validTo: input.validTo.toISOString(),
    isLimitedUses: true,
    maxUsesAllowed: 1,
    isOncePerCustomer: true,
    trigger: { type: "CODE", promoCode: input.promoCode },
    criteria: {
      type: "PRODUCT",
      productId: productIds[0],
      productIds,
    },
    template: {
      type: "PERCENTAGE",
      percentage: 100,
      maxApplicationsPerCart: 1,
    },
  };
}

export type DiscountSnapshot = {
  id: string;
  promoCode: string;
  numberOfUses: number;
  validTo: string | null;
  status: string | null;
};

export type IssuedRewardSnapshot = {
  id: string;
  promoCode: string | null;
  squarespaceDiscountId: string | null;
  validTo: string | null;
  status: RewardStatus;
};

export type CleanupAction =
  | { type: "redeem_online"; rewardId: string; discountId: string | null }
  | { type: "restore"; rewardId: string; discountId: string | null; validTo: string }
  | { type: "delete_discount"; discountId: string };

function codeKey(code: string | null | undefined): string {
  return code?.trim().toUpperCase() ?? "";
}

function instant(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function isPast(value: string | null | undefined, now: Date): boolean {
  const parsed = instant(value);
  if (parsed === null) return false;
  return parsed <= now.getTime();
}

/**
 * Mark a code redeemed when Squarespace has used it, or when a manually
 * imported order already carries that code. An unused code past validTo
 * is deleted and the reward returns to earned. Spent and expired TMF
 * discounts that are no longer tied to an issued reward are deleted.
 */
export function planDiscountCleanup(input: {
  discounts: readonly DiscountSnapshot[];
  rewards: readonly IssuedRewardSnapshot[];
  importedPromoCodes: readonly string[];
  now: Date;
}): CleanupAction[] {
  const imported = new Set(input.importedPromoCodes.map((code) => codeKey(code)).filter(Boolean));
  const byCode = new Map<string, DiscountSnapshot>();
  const byId = new Map<string, DiscountSnapshot>();
  for (const discount of input.discounts) {
    if (discount.id) byId.set(discount.id, discount);
    const key = codeKey(discount.promoCode);
    if (key) byCode.set(key, discount);
  }

  const actions: CleanupAction[] = [];
  const handledDiscountIds = new Set<string>();

  for (const reward of input.rewards) {
    if (reward.status !== "issued" && reward.status !== "redeemed") continue;
    const key = codeKey(reward.promoCode);
    const discount = (reward.squarespaceDiscountId ? byId.get(reward.squarespaceDiscountId) : undefined)
      ?? (key ? byCode.get(key) : undefined);
    if (discount) handledDiscountIds.add(discount.id);

    if (reward.status === "redeemed") {
      if (discount) actions.push({ type: "delete_discount", discountId: discount.id });
      continue;
    }

    const uses = discount?.numberOfUses ?? 0;
    const used = uses >= 1 || (key !== "" && imported.has(key));
    const expired = discount?.status === "EXPIRED"
      || isPast(discount?.validTo ?? null, input.now)
      || isPast(reward.validTo, input.now);

    if (used) {
      actions.push({
        type: "redeem_online",
        rewardId: reward.id,
        discountId: discount?.id ?? reward.squarespaceDiscountId,
      });
      continue;
    }
    if (expired) {
      const validTo = reward.validTo ?? discount?.validTo ?? input.now.toISOString();
      actions.push({
        type: "restore",
        rewardId: reward.id,
        discountId: discount?.id ?? reward.squarespaceDiscountId,
        validTo,
      });
    }
  }

  for (const discount of input.discounts) {
    if (handledDiscountIds.has(discount.id)) continue;
    if (!isRewardPromoCode(discount.promoCode)) continue;
    const spent = discount.numberOfUses >= 1;
    const expired = discount.status === "EXPIRED" || isPast(discount.validTo, input.now);
    if (spent || expired) actions.push({ type: "delete_discount", discountId: discount.id });
  }

  return actions;
}

export function validateAdjustment(rolls: unknown, reason: unknown):
  | { ok: true; rolls: number; reason: string }
  | { ok: false; error: string } {
  if (typeof rolls !== "number" || !Number.isInteger(rolls) || rolls === 0 || rolls < -500 || rolls > 500) {
    return { ok: false, error: "Enter a whole number of rolls from -500 to 500, other than zero." };
  }
  if (typeof reason !== "string") return { ok: false, error: "A reason is required." };
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "A reason is required." };
  if (trimmed.length > 300) return { ok: false, error: "Keep the reason under 300 characters." };
  return { ok: true, rolls, reason: trimmed };
}

export function validateInStoreRoll(input: {
  reward: { customerId: string; status: string } | null;
  customerId: string;
  rollIndex: number;
  rolls: readonly { film_type?: string | null; blank?: unknown }[];
  usedRollIndexes: readonly number[];
}): { ok: true } | { ok: false; error: string } {
  if (!input.reward || input.reward.customerId !== input.customerId) {
    return { ok: false, error: "That reward is not on this customer's account." };
  }
  if (input.reward.status !== "earned" && input.reward.status !== "issued") {
    return { ok: false, error: "That reward is no longer available." };
  }
  if (!Number.isInteger(input.rollIndex) || input.rollIndex < 0 || input.rollIndex >= input.rolls.length) {
    return { ok: false, error: "Choose the roll this reward covers." };
  }
  const roll = input.rolls[input.rollIndex];
  if (!roll || !isQualifyingRewardRoll(roll)) {
    return { ok: false, error: "A reward covers one 35mm, 120, or disposable roll." };
  }
  if (input.usedRollIndexes.includes(input.rollIndex)) {
    return { ok: false, error: "That roll already has a reward on it." };
  }
  return { ok: true };
}

export function rewardHistoryLabel(event: {
  kind: string;
  rolls: number;
  reason?: string | null;
  via?: string | null;
}): string {
  if (event.kind === "earn") {
    const count = Math.max(0, event.rolls);
    return count === 1 ? "1 roll counted" : `${count} rolls counted`;
  }
  if (event.kind === "backfill") {
    const count = Math.max(0, event.rolls);
    return count === 1 ? "Starting credit: 1 roll" : `Starting credit: ${count} rolls`;
  }
  if (event.kind === "adjust") {
    const sign = event.rolls > 0 ? `+${event.rolls}` : String(event.rolls);
    const because = event.reason?.trim() ? ` — ${event.reason.trim()}` : "";
    return `Adjustment ${sign} rolls${because}`;
  }
  if (event.kind === "redeem") {
    return event.via === "in_store" ? "Yours, applied this reward in the shop." : "Online code used";
  }
  if (event.kind === "expire") return "Online code expired";
  if (event.kind === "restore") return "Reward returned to your account";
  return "Reward update";
}

export type AccountRewardCard = {
  id: string;
  status: "earned" | "issued";
  promoCode: string | null;
  validTo: string | null;
};

export type AccountRewardHistoryItem = {
  id: string;
  label: string;
  at: string;
};

export type AccountRewardsPayload = {
  customerId: string | null;
  progress: number;
  progressLabel: string;
  rewardReady: boolean;
  cards: AccountRewardCard[];
  history: AccountRewardHistoryItem[];
  onlineEnabled: boolean;
  onlineMessage: string | null;
};

export function toAccountRewards(input: {
  customerId: string | null;
  events: readonly { id: string; kind: string; rolls: number; reason?: string | null; createdAt: string; rewardId?: string | null }[];
  rewards: readonly { id: string; status: string; promoCode: string | null; validTo: string | null; redeemedVia?: string | null }[];
  onlineEnabled: boolean;
  onlineMessage: string | null;
}): AccountRewardsPayload {
  const balance = rewardBalance(input.events);
  const via = new Map(input.rewards.map((reward) => [reward.id, reward.redeemedVia ?? null]));
  const cards = input.rewards.flatMap((reward): AccountRewardCard[] => {
    if (reward.status !== "earned" && reward.status !== "issued") return [];
    return [{
      id: reward.id,
      status: reward.status,
      promoCode: reward.promoCode,
      validTo: reward.validTo,
    }];
  });
  const history = [...input.events]
    .filter((event) => event.kind !== "earn" || event.rolls > 0)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((event) => ({
      id: event.id,
      at: event.createdAt,
      label: rewardHistoryLabel({
        kind: event.kind,
        rolls: event.rolls,
        reason: event.reason,
        via: event.rewardId ? via.get(event.rewardId) : null,
      }),
    }));
  const rewardReady = cards.some((card) => card.status === "earned");
  return {
    customerId: input.customerId,
    progress: balance.progress,
    progressLabel: rewardProgressSentence(balance.progress, balance.progressTarget),
    rewardReady,
    cards,
    history,
    onlineEnabled: input.onlineEnabled,
    onlineMessage: input.onlineMessage,
  };
}

/** Sample for the local account preview. Production never serves this. */
export function previewAccountRewards(
  punches: 0 | 7 | 10 = 7,
  now = new Date("2026-08-01T15:00:00.000Z"),
): AccountRewardsPayload {
  const shared = {
    customerId: "preview-customer",
    onlineEnabled: true as const,
    onlineMessage: null,
  };
  if (punches === 0) {
    return toAccountRewards({ ...shared, rewards: [], events: [] });
  }
  if (punches === 10) {
    return toAccountRewards({
      ...shared,
      rewards: [{ id: "preview-earned", status: "earned", promoCode: null, validTo: null }],
      events: [{
        id: "preview-earn",
        kind: "earn",
        rolls: 10,
        reason: "Counted when scans were sent",
        createdAt: "2026-05-02T15:00:00.000Z",
        rewardId: null,
      }],
    });
  }
  return toAccountRewards({
    ...shared,
    rewards: [],
    events: [{
      id: "preview-earn",
      kind: "earn",
      rolls: 7,
      reason: "Counted when scans were sent",
      createdAt: now.toISOString(),
      rewardId: null,
    }],
  });
}

export function isRewardsSchemaMissing(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (code === "42P01" || code === "PGRST205") return true;
  const lowered = message.toLowerCase();
  const mentionsRewards = lowered.includes("reward_events")
    || lowered.includes("reward_settings")
    || /\brewards\b/.test(lowered);
  return mentionsRewards && (
    lowered.includes("does not exist")
    || lowered.includes("schema cache")
    || lowered.includes("could not find")
  );
}
