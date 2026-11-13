/**
 * Service-role access to the rewards ledger. Staff routes call this
 * after requireAuth. Customer pages only read through the user JWT.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getOrdersByCustomerId } from "@/lib/db";
import {
  isRewardsSchemaMissing,
  onlineCodeAvailability,
  resolveRewardProductIds,
  rewardBalance,
  validateInStoreRoll,
  REWARD_PRODUCT_IDS_ENV,
  ONLINE_CODE_PAUSED_MESSAGE,
  SQUARESPACE_DISCOUNTS_API_KEY_ENV,
  type RewardOrder,
  type RewardStatus,
} from "@/lib/rewards";
import {
  adjustCustomerRolls,
  applyDiscountCleanup,
  issueOnlineCode,
  linkImportedCodeToOrder,
  markRewardRedeemed,
  reconcileCustomer,
  syncOrderEarns,
  type DiscountClient,
  type RewardEventRecord,
  type RewardRecord,
  type RewardRepository,
} from "@/lib/rewards-service";
import {
  createSquarespaceDiscount,
  deleteSquarespaceDiscount,
  listSquarespaceRewardDiscounts,
  SquarespaceDiscountError,
} from "@/lib/squarespace-discounts";

let client: SupabaseClient | null = null;

function service(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

type EventRow = {
  id: string;
  customer_id: string;
  kind: string;
  rolls: number;
  order_id: string | null;
  reward_id: string | null;
  reason: string | null;
  idempotency_key: string;
  created_at: string;
};

type RewardRow = {
  id: string;
  customer_id: string;
  status: RewardStatus;
  sequence: number;
  promo_code: string | null;
  squarespace_discount_id: string | null;
  valid_to: string | null;
  redeemed_order: string | null;
  redeemed_roll_index: number | null;
  redeemed_via: "online" | "in_store" | null;
  created_at: string;
};

const REWARD_COLUMNS = "id, customer_id, status, sequence, promo_code, squarespace_discount_id, valid_to, redeemed_order, redeemed_roll_index, redeemed_via, created_at";

function mapEvent(row: EventRow): RewardEventRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    kind: row.kind,
    rolls: row.rolls,
    orderId: row.order_id,
    rewardId: row.reward_id,
    reason: row.reason,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}

function mapReward(row: RewardRow): RewardRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    status: row.status,
    sequence: row.sequence,
    promoCode: row.promo_code,
    squarespaceDiscountId: row.squarespace_discount_id,
    validTo: row.valid_to,
    redeemedOrder: row.redeemed_order,
    redeemedRollIndex: row.redeemed_roll_index,
    redeemedVia: row.redeemed_via,
    createdAt: row.created_at,
  };
}

function throwIf(error: { message: string; code?: string } | null): void {
  if (!error) return;
  const wrapped = new Error(error.message) as Error & { code?: string };
  wrapped.code = error.code;
  throw wrapped;
}

export function rewardsRepository(): RewardRepository {
  const db = service();
  return {
    async listEvents(customerId) {
      const { data, error } = await db
        .from("reward_events")
        .select("id, customer_id, kind, rolls, order_id, reward_id, reason, idempotency_key, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: true });
      throwIf(error);
      return ((data ?? []) as EventRow[]).map(mapEvent);
    },
    async upsertEarns(rows) {
      if (rows.length === 0) return;
      const { error } = await db.from("reward_events").upsert(rows.map((row) => ({
        customer_id: row.customerId,
        kind: "earn",
        rolls: row.rolls,
        order_id: row.orderId,
        idempotency_key: row.idempotencyKey,
        reason: row.reason,
      })), { onConflict: "idempotency_key" });
      throwIf(error);
    },
    async listRewards(customerId) {
      const { data, error } = await db
        .from("rewards")
        .select(REWARD_COLUMNS)
        .eq("customer_id", customerId)
        .order("sequence", { ascending: true });
      throwIf(error);
      return ((data ?? []) as RewardRow[]).map(mapReward);
    },
    async listIssuedAndRedeemed() {
      const { data, error } = await db
        .from("rewards")
        .select(REWARD_COLUMNS)
        .in("status", ["issued", "redeemed"]);
      throwIf(error);
      return ((data ?? []) as RewardRow[]).map(mapReward);
    },
    async getReward(id) {
      const { data, error } = await db.from("rewards").select(REWARD_COLUMNS).eq("id", id).maybeSingle();
      throwIf(error);
      return data ? mapReward(data as RewardRow) : null;
    },
    async insertReward(customerId, sequence) {
      const { data, error } = await db
        .from("rewards")
        .insert({ customer_id: customerId, status: "earned", sequence })
        .select(REWARD_COLUMNS)
        .single();
      throwIf(error);
      return mapReward(data as RewardRow);
    },
    async deleteRewards(ids) {
      if (ids.length === 0) return;
      const { error } = await db.from("rewards").delete().in("id", ids);
      throwIf(error);
    },
    async updateReward(id, patch, expectedStatuses) {
      const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.status !== undefined) body.status = patch.status;
      if (patch.promoCode !== undefined) body.promo_code = patch.promoCode;
      if (patch.squarespaceDiscountId !== undefined) body.squarespace_discount_id = patch.squarespaceDiscountId;
      if (patch.validTo !== undefined) body.valid_to = patch.validTo;
      if (patch.redeemedOrder !== undefined) body.redeemed_order = patch.redeemedOrder;
      if (patch.redeemedRollIndex !== undefined) body.redeemed_roll_index = patch.redeemedRollIndex;
      if (patch.redeemedVia !== undefined) body.redeemed_via = patch.redeemedVia;
      let query = db.from("rewards").update(body).eq("id", id);
      if (expectedStatuses.length > 0) query = query.in("status", expectedStatuses);
      const { data, error } = await query.select(REWARD_COLUMNS).maybeSingle();
      throwIf(error);
      return data ? mapReward(data as RewardRow) : null;
    },
    async insertEvent(event) {
      const { error } = await db.from("reward_events").insert({
        customer_id: event.customerId,
        kind: event.kind,
        rolls: event.rolls,
        order_id: event.orderId,
        reward_id: event.rewardId,
        reason: event.reason,
        idempotency_key: event.idempotencyKey,
      });
      const duplicate = error?.code === "23505" || (error?.message ?? "").toLowerCase().includes("duplicate key");
      if (duplicate) return "exists";
      throwIf(error);
      return "inserted";
    },
    async findByPromoCode(code) {
      const candidates = [...new Set([code.trim(), code.trim().toUpperCase()].filter(Boolean))];
      for (const candidate of candidates) {
        const { data, error } = await db
          .from("rewards")
          .select(REWARD_COLUMNS)
          .eq("promo_code", candidate)
          .maybeSingle();
        throwIf(error);
        if (data) return mapReward(data as RewardRow);
      }
      return null;
    },
    async legacyOrderIds(orderIds) {
      const ids = [...new Set(orderIds.filter((id) => id.trim()))];
      if (ids.length === 0) return [];
      const { data, error } = await db
        .from("reward_legacy_orders")
        .select("order_id")
        .in("order_id", ids);
      if (error) {
        const message = error.message.toLowerCase();
        if (
          error.code === "42P01"
          || error.code === "PGRST205"
          || message.includes("reward_legacy_orders")
        ) {
          return [];
        }
        throwIf(error);
      }
      return ((data ?? []) as { order_id: string }[])
        .map((row) => row.order_id)
        .filter((id) => typeof id === "string" && id.length > 0);
    },
    async listImportedPromoCodes() {
      const { data, error } = await db
        .from("incoming_squarespace_drafts")
        .select("squarespace_promo_codes");
      if (error) {
        const message = error.message.toLowerCase();
        if (message.includes("squarespace_promo_codes")) return [];
        throwIf(error);
      }
      const codes: string[] = [];
      for (const row of data ?? []) {
        const list = (row as { squarespace_promo_codes?: unknown }).squarespace_promo_codes;
        if (!Array.isArray(list)) continue;
        for (const code of list) {
          if (typeof code === "string" && code.trim()) codes.push(code.trim());
        }
      }
      return codes;
    },
  };
}

export async function savedRewardProductIds(): Promise<string[]> {
  const { data, error } = await service()
    .from("reward_settings")
    .select("product_ids")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    if (isRewardsSchemaMissing(error)) return [];
    throwIf(error);
  }
  const ids = (data as { product_ids?: unknown } | null)?.product_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

export async function saveRewardProductIds(ids: string[]): Promise<void> {
  const { error } = await service()
    .from("reward_settings")
    .upsert({ id: 1, product_ids: ids, updated_at: new Date().toISOString() }, { onConflict: "id" });
  throwIf(error);
}

export function configuredProductIds(saved: readonly string[]): string[] {
  return resolveRewardProductIds(saved, process.env[REWARD_PRODUCT_IDS_ENV]);
}

export function discountClientFromEnv(): DiscountClient | null {
  const apiKey = process.env[SQUARESPACE_DISCOUNTS_API_KEY_ENV]?.trim();
  if (!apiKey) return null;
  return {
    createDiscount(body) {
      return createSquarespaceDiscount(fetch, apiKey, body);
    },
    deleteDiscount(id) {
      return deleteSquarespaceDiscount(fetch, apiKey, id);
    },
  };
}

export async function recordOrderRewards(order: RewardOrder): Promise<void> {
  try {
    await syncOrderEarns(rewardsRepository(), [order]);
  } catch (error) {
    if (isRewardsSchemaMissing(error)) {
      console.error("[rewards] Run migration 032_customer_rewards.sql before rolls can count.");
      return;
    }
    console.error("[rewards] Could not count rolls:", error instanceof Error ? error.message : error);
  }
}

export async function recountCustomerRewards(customerId: string | null | undefined): Promise<void> {
  if (!customerId) return;
  try {
    const orders = await getOrdersByCustomerId(customerId);
    await syncOrderEarns(rewardsRepository(), orders);
  } catch (error) {
    if (isRewardsSchemaMissing(error)) return;
    console.error("[rewards] Could not recount customer:", error instanceof Error ? error.message : error);
  }
}

export async function reconcileCustomerRewards(customerId: string | null | undefined): Promise<void> {
  if (!customerId) return;
  try {
    await reconcileCustomer(rewardsRepository(), customerId);
  } catch (error) {
    if (isRewardsSchemaMissing(error)) return;
    console.error("[rewards] Could not refresh rewards:", error instanceof Error ? error.message : error);
  }
}

export type CustomerRewardView = {
  ready: boolean;
  customerId: string;
  netRolls: number;
  progress: number;
  progressTarget: number;
  rewardsOwed: number;
  rewards: RewardRecord[];
  events: RewardEventRecord[];
  online: { enabled: boolean; message: string | null };
  productIds: string[];
};

export async function loadCustomerRewardView(customerId: string, options: { sync?: boolean } = {}): Promise<CustomerRewardView> {
  const empty: CustomerRewardView = {
    ready: false,
    customerId,
    netRolls: 0,
    progress: 0,
    progressTarget: 10,
    rewardsOwed: 0,
    rewards: [],
    events: [],
    online: { enabled: false, message: null },
    productIds: [],
  };
  try {
    const repo = rewardsRepository();
    if (options.sync !== false) {
      const orders = await getOrdersByCustomerId(customerId);
      await syncOrderEarns(repo, orders);
    }
    const [events, rewards, savedIds] = await Promise.all([
      repo.listEvents(customerId),
      repo.listRewards(customerId),
      savedRewardProductIds(),
    ]);
    const balance = rewardBalance(events);
    const productIds = configuredProductIds(savedIds);
    const online = onlineCodeAvailability({
      apiKey: process.env[SQUARESPACE_DISCOUNTS_API_KEY_ENV],
      productIds,
    });
    return {
      ready: true,
      customerId,
      netRolls: balance.netRolls,
      progress: balance.progress,
      progressTarget: balance.progressTarget,
      rewardsOwed: balance.rewardsOwed,
      rewards,
      events,
      online: online.enabled ? { enabled: true, message: null } : { enabled: false, message: online.message },
      productIds,
    };
  } catch (error) {
    if (isRewardsSchemaMissing(error)) return empty;
    throw error;
  }
}

export async function issueCustomerRewardCode(rewardId: string): Promise<
  { ok: true; code: string; validTo: string; alreadyIssued: boolean }
  | { ok: false; status: number; error: string }
> {
  const online = onlineCodeAvailability({
    apiKey: process.env[SQUARESPACE_DISCOUNTS_API_KEY_ENV],
    productIds: configuredProductIds(await savedRewardProductIds()),
  });
  if (!online.enabled) return { ok: false, status: 503, error: online.message };
  const client = discountClientFromEnv();
  if (!client) return { ok: false, status: 503, error: ONLINE_CODE_PAUSED_MESSAGE };
  const result = await issueOnlineCode(rewardsRepository(), client, {
    rewardId,
    productIds: configuredProductIds(await savedRewardProductIds()),
  });
  if (!result.ok) return { ok: false, status: 400, error: result.error };
  return { ok: true, code: result.code, validTo: result.validTo, alreadyIssued: result.alreadyIssued };
}

export async function checkInStoreReward(input: {
  rewardId: string;
  customerId: string;
  rollIndex: number;
  rolls: readonly { film_type?: string | null; blank?: unknown }[];
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  try {
    const reward = await rewardsRepository().getReward(input.rewardId);
    const check = validateInStoreRoll({
      reward: reward ? { customerId: reward.customerId, status: reward.status } : null,
      customerId: input.customerId,
      rollIndex: input.rollIndex,
      rolls: input.rolls,
      usedRollIndexes: [],
    });
    if (!check.ok) return { ok: false, status: 400, error: check.error };
    return { ok: true };
  } catch (error) {
    if (isRewardsSchemaMissing(error)) {
      return { ok: false, status: 503, error: "Rewards are not in the database yet. Run migration 032_customer_rewards.sql, then try again." };
    }
    throw error;
  }
}

export async function redeemCustomerReward(input: {
  rewardId: string;
  orderId: string;
  rollIndex: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = discountClientFromEnv();
  return markRewardRedeemed(rewardsRepository(), client, {
    rewardId: input.rewardId,
    via: "in_store",
    orderId: input.orderId,
    rollIndex: input.rollIndex,
  });
}

export async function adjustCustomerRewardRolls(customerId: string, rolls: number, reason: string): Promise<void> {
  await adjustCustomerRolls(rewardsRepository(), { customerId, rolls, reason });
}

export async function attachImportedRewardCodes(orderId: string, promoCodes: readonly string[]): Promise<void> {
  if (promoCodes.length === 0) return;
  try {
    await linkImportedCodeToOrder(rewardsRepository(), discountClientFromEnv(), { orderId, promoCodes });
  } catch (error) {
    if (isRewardsSchemaMissing(error)) return;
    console.error("[rewards] Could not match an imported code:", error instanceof Error ? error.message : error);
  }
}

export async function loadRewardBoard(): Promise<{
  ready: boolean;
  redemptions: { orderId: string; rewardId: string; rollIndex: number | null; via: "in_store" }[];
  available: { customerId: string; id: string; status: "earned" | "issued"; promoCode: string | null }[];
}> {
  const empty = { ready: false, redemptions: [], available: [] };
  try {
    const { data, error } = await service()
      .from("rewards")
      .select(REWARD_COLUMNS)
      .in("status", ["earned", "issued", "redeemed"]);
    throwIf(error);
    const rewards = ((data ?? []) as RewardRow[]).map(mapReward);
    return {
      ready: true,
      redemptions: rewards.flatMap((reward) => (
        reward.status === "redeemed" && reward.redeemedOrder && reward.redeemedVia === "in_store"
          ? [{
            orderId: reward.redeemedOrder,
            rewardId: reward.id,
            rollIndex: reward.redeemedRollIndex,
            via: "in_store" as const,
          }]
          : []
      )),
      available: rewards.flatMap((reward) => (
        reward.status === "earned" || reward.status === "issued"
          ? [{
            customerId: reward.customerId,
            id: reward.id,
            status: reward.status,
            promoCode: reward.promoCode,
          }]
          : []
      )),
    };
  } catch (error) {
    if (isRewardsSchemaMissing(error)) return empty;
    throw error;
  }
}

export async function runRewardDiscountCleanup(fetchImpl: typeof fetch = fetch): Promise<{
  redeemed: number;
  restored: number;
  deleted: number;
  skipped: boolean;
}> {
  const apiKey = process.env[SQUARESPACE_DISCOUNTS_API_KEY_ENV]?.trim();
  if (!apiKey) return { redeemed: 0, restored: 0, deleted: 0, skipped: true };
  const discounts = await listSquarespaceRewardDiscounts(fetchImpl, apiKey);
  const client: DiscountClient = {
    createDiscount(body) {
      return createSquarespaceDiscount(fetchImpl, apiKey, body);
    },
    deleteDiscount(id) {
      return deleteSquarespaceDiscount(fetchImpl, apiKey, id);
    },
  };
  const result = await applyDiscountCleanup(rewardsRepository(), client, { squarespaceDiscounts: discounts });
  return { ...result, skipped: false };
}

export function discountFailureMessage(error: unknown): string {
  if (error instanceof SquarespaceDiscountError) return error.message;
  return error instanceof Error ? error.message : "Squarespace request failed";
}
