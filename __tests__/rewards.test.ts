import { describe, expect, it } from "vitest";
import { ORDER_STATUS } from "@/lib/constants";
import {
  buildRewardDiscountRequest,
  earnRollsForOrder,
  generateRewardPromoCode,
  historicalCreditDistribution,
  historicalStartingCredit,
  isGiftCardShapedCode,
  isRewardPromoCode,
  onlineCodeAvailability,
  orderEarnIdempotencyKey,
  parseRewardProductIds,
  planDiscountCleanup,
  planRewardRows,
  punchCardCaption,
  qualifyingRollCount,
  rewardBalance,
  rewardProgressSentence,
  validateAdjustment,
  validateInStoreRoll,
  ONLINE_CODE_PAUSED_MESSAGE,
  type RewardOrder,
} from "@/lib/rewards";
import {
  applyCleanupActions,
  earnWritesForOrders,
  issueOnlineCode,
  markRewardRedeemed,
  syncOrderEarns,
  type DiscountClient,
  type RewardRecord,
  type RewardRepository,
} from "@/lib/rewards-service";
import { SquarespaceDiscountError } from "@/lib/squarespace-discounts";
import { promoCodesFromSquarespaceOrder, squarespaceLineProductId } from "@/lib/squarespace-orders";
import type { RollDetail } from "@/lib/types";

function roll(overrides: Partial<RollDetail> = {}): RollDetail {
  return {
    film_type: "35mm",
    film_process: "Color",
    scan_size: "High-Res",
    ...overrides,
  };
}

function order(overrides: Partial<RewardOrder> = {}): RewardOrder {
  return {
    id: "order-1",
    customer_id: "customer-1",
    status: ORDER_STATUS.SCANS_SENT,
    film_type: "35mm",
    roll_count: 1,
    roll_details: [roll()],
    ...overrides,
  };
}

function memoryRepository(legacyIds: readonly string[] = []): RewardRepository & {
  rewards: RewardRecord[];
  events: { customerId: string; kind: string; rolls: number; orderId: string | null; rewardId: string | null; reason: string | null; idempotencyKey: string }[];
} {
  const rewards: RewardRecord[] = [];
  const events: {
    customerId: string;
    kind: string;
    rolls: number;
    orderId: string | null;
    rewardId: string | null;
    reason: string | null;
    idempotencyKey: string;
  }[] = [];
  let sequence = 0;
  const repo: RewardRepository = {
    async listEvents(customerId) {
      return events.filter((event) => event.customerId === customerId).map((event, index) => ({
        id: `event-${index}`,
        createdAt: "2026-08-01T00:00:00.000Z",
        ...event,
      }));
    },
    async upsertEarns(rows) {
      for (const row of rows) {
        const existing = events.find((event) => event.idempotencyKey === row.idempotencyKey);
        if (existing) {
          existing.rolls = row.rolls;
          existing.customerId = row.customerId;
          existing.reason = row.reason;
          existing.orderId = row.orderId;
          continue;
        }
        events.push({
          customerId: row.customerId,
          kind: "earn",
          rolls: row.rolls,
          orderId: row.orderId,
          rewardId: null,
          reason: row.reason,
          idempotencyKey: row.idempotencyKey,
        });
      }
    },
    async listRewards(customerId) {
      return rewards.filter((reward) => reward.customerId === customerId);
    },
    async listIssuedAndRedeemed() {
      return rewards.filter((reward) => reward.status === "issued" || reward.status === "redeemed");
    },
    async getReward(id) {
      return rewards.find((reward) => reward.id === id) ?? null;
    },
    async insertReward(customerId, rewardSequence) {
      if (rewards.some((reward) => reward.customerId === customerId && reward.sequence === rewardSequence)) {
        const error = new Error("duplicate key") as Error & { code: string };
        error.code = "23505";
        throw error;
      }
      sequence += 1;
      const created: RewardRecord = {
        id: `reward-${sequence}`,
        customerId,
        status: "earned",
        sequence: rewardSequence,
        promoCode: null,
        squarespaceDiscountId: null,
        validTo: null,
        redeemedOrder: null,
        redeemedRollIndex: null,
        redeemedVia: null,
        createdAt: "2026-08-01T00:00:00.000Z",
      };
      rewards.push(created);
      return created;
    },
    async deleteRewards(ids) {
      for (const id of ids) {
        const index = rewards.findIndex((reward) => reward.id === id);
        if (index >= 0) rewards.splice(index, 1);
      }
    },
    async updateReward(id, patch, expectedStatuses) {
      const reward = rewards.find((entry) => entry.id === id);
      if (!reward) return null;
      if (expectedStatuses.length > 0 && !expectedStatuses.includes(reward.status)) return null;
      Object.assign(reward, patch);
      return reward;
    },
    async insertEvent(event) {
      if (events.some((entry) => entry.idempotencyKey === event.idempotencyKey)) return "exists";
      events.push(event);
      return "inserted";
    },
    async findByPromoCode(code) {
      const key = code.trim().toUpperCase();
      return rewards.find((reward) => reward.promoCode?.toUpperCase() === key) ?? null;
    },
    async listImportedPromoCodes() {
      return [];
    },
    async legacyOrderIds(orderIds) {
      const legacy = new Set(legacyIds);
      return orderIds.filter((id) => legacy.has(id));
    },
  };
  return Object.assign(repo, { rewards, events });
}

describe("qualifying rolls", () => {
  it("counts 35mm, 120, and disposable rolls and skips blank and 110", () => {
    const finished = order({
      roll_count: 5,
      roll_details: [
        roll({ film_type: "35mm" }),
        roll({ film_type: "120" }),
        roll({ film_type: "Disposable Camera" }),
        roll({ film_type: "35mm", blank: true }),
        roll({ film_type: "110" }),
      ],
    });
    expect(qualifyingRollCount(finished)).toBe(3);
    expect(earnRollsForOrder(finished)).toBe(3);
  });

  it("uses roll_count for a legacy order with no per-roll list", () => {
    expect(qualifyingRollCount(order({
      roll_details: [],
      film_type: "120",
      roll_count: 4,
    }))).toBe(4);
    expect(qualifyingRollCount(order({
      roll_details: [],
      film_type: "110",
      roll_count: 4,
    }))).toBe(0);
  });

  it("counts when scans are sent, and when a process-only order is ready for pickup", () => {
    expect(earnRollsForOrder(order({ status: ORDER_STATUS.RECEIVED_AT_LAB }))).toBe(0);
    expect(earnRollsForOrder(order({ status: ORDER_STATUS.SCANS_SENT }))).toBe(1);
    expect(earnRollsForOrder(order({
      status: ORDER_STATUS.READY_FOR_PICKUP,
      roll_details: [roll({ scan_size: "Process Only" })],
    }))).toBe(1);
    expect(earnRollsForOrder(order({
      status: ORDER_STATUS.READY_FOR_PICKUP,
      roll_details: [roll({ scan_size: "High-Res" })],
    }))).toBe(0);
    expect(earnRollsForOrder(order({ customer_id: null }))).toBe(0);
  });
});

describe("idempotent counting", () => {
  it("keeps one earn row when the same finished order is synced twice", async () => {
    const repo = memoryRepository();
    const finished = order({
      roll_details: [roll(), roll({ film_type: "120" }), roll({ blank: true })],
      roll_count: 3,
    });
    await syncOrderEarns(repo, [finished]);
    await syncOrderEarns(repo, [finished]);
    const earns = repo.events.filter((event) => event.kind === "earn");
    expect(earns).toHaveLength(1);
    expect(earns[0]?.rolls).toBe(2);
    expect(earns[0]?.idempotencyKey).toBe(orderEarnIdempotencyKey("order-1"));
    expect(repo.rewards).toHaveLength(0);
  });

  it("updates the same row when a roll is marked blank or the order leaves the finished status", async () => {
    const repo = memoryRepository();
    const rolls = [roll(), roll(), roll({ film_type: "Disposable Camera" })];
    await syncOrderEarns(repo, [order({ roll_details: rolls, roll_count: 3 })]);
    await syncOrderEarns(repo, [order({
      roll_details: [roll(), roll({ blank: true }), roll({ film_type: "Disposable Camera" })],
      roll_count: 3,
    })]);
    expect(repo.events.filter((event) => event.kind === "earn")).toHaveLength(1);
    expect(repo.events[0]?.rolls).toBe(2);

    await syncOrderEarns(repo, [order({ status: ORDER_STATUS.RECEIVED_AT_LAB, roll_details: rolls })]);
    expect(repo.events).toHaveLength(1);
    expect(repo.events[0]?.rolls).toBe(0);
    expect(rewardBalance(repo.events).rewardsOwed).toBe(0);
  });

  it("opens one reward per 10 rolls and does not remove a redeemed reward", async () => {
    const repo = memoryRepository();
    await syncOrderEarns(repo, [order({
      roll_count: 17,
      roll_details: Array.from({ length: 17 }, () => roll()),
    })]);
    expect(rewardBalance(repo.events)).toMatchObject({ rewardsOwed: 1, progress: 7 });
    expect(rewardProgressSentence(7)).toBe("7 of 10 rolls toward your next free dev + high-res scan");
    expect(repo.rewards).toHaveLength(1);

    repo.rewards[0]!.status = "redeemed";
    await syncOrderEarns(repo, [order({
      roll_count: 9,
      roll_details: Array.from({ length: 9 }, () => roll()),
    })]);
    expect(repo.rewards.map((reward) => reward.status)).toEqual(["redeemed"]);
    expect(planRewardRows([{ id: "kept", status: "redeemed", sequence: 1 }], 0).deleteIds).toEqual([]);
  });
});

describe("online codes", () => {
  it("builds a single-use code for the configured dev and scan products", () => {
    const body = buildRewardDiscountRequest({
      promoCode: "TMF-K7MQ2P",
      productIds: ["35mm-dev", "120-dev", "disposable-dev"],
      validFrom: new Date("2026-08-01T00:00:00.000Z"),
      validTo: new Date("2026-10-30T00:00:00.000Z"),
    });
    expect(body).toMatchObject({
      name: "Yours, free dev + high-res scan",
      isLimitedUses: true,
      maxUsesAllowed: 1,
      isOncePerCustomer: true,
      trigger: { type: "CODE", promoCode: "TMF-K7MQ2P" },
      criteria: {
        type: "PRODUCT",
        productId: "35mm-dev",
        productIds: ["35mm-dev", "120-dev", "disposable-dev"],
      },
      template: { type: "PERCENTAGE", percentage: 100, maxApplicationsPerCart: 1 },
    });
    expect(isRewardPromoCode("TMF-K7MQ2P")).toBe(true);
    expect(isGiftCardShapedCode("GC1234567890ABCD")).toBe(true);
    expect(isRewardPromoCode("GC1234567890ABCD")).toBe(false);
  });

  it("refuses a code when the api key or product ids are missing", () => {
    expect(onlineCodeAvailability({ apiKey: "", productIds: ["p"] }).enabled).toBe(false);
    expect(onlineCodeAvailability({ apiKey: undefined, productIds: ["p"] })).toMatchObject({
      message: ONLINE_CODE_PAUSED_MESSAGE,
    });
    expect(onlineCodeAvailability({ apiKey: "key", productIds: [] }).enabled).toBe(false);
    expect(onlineCodeAvailability({ apiKey: "key", productIds: ["p"] }).enabled).toBe(true);
  });

  it("creates one discount and returns the same code if the reward was already issued", async () => {
    const repo = memoryRepository();
    repo.rewards.push({
      id: "reward-1",
      customerId: "customer-1",
      status: "earned",
      sequence: 1,
      promoCode: null,
      squarespaceDiscountId: null,
      validTo: null,
      redeemedOrder: null,
      redeemedRollIndex: null,
      redeemedVia: null,
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    const created: unknown[] = [];
    const discounts: DiscountClient = {
      async createDiscount(body) {
        created.push(body);
        const trigger = body.trigger as { promoCode: string };
        return { id: "discount-1", promoCode: trigger.promoCode };
      },
      async deleteDiscount() {
        throw new Error("should not delete");
      },
    };
    const code = generateRewardPromoCode(() => 0);
    const issued = await issueOnlineCode(repo, discounts, {
      rewardId: "reward-1",
      productIds: ["dev-scan"],
      now: new Date("2026-08-01T00:00:00.000Z"),
      randomInt: () => 0,
    });
    expect(issued.ok).toBe(true);
    if (issued.ok) expect(issued.code).toBe(code);
    expect(created).toHaveLength(1);
    const again = await issueOnlineCode(repo, discounts, {
      rewardId: "reward-1",
      productIds: ["dev-scan"],
      randomInt: () => 1,
    });
    expect(again).toMatchObject({ ok: true, alreadyIssued: true, code });
    expect(created).toHaveLength(1);
    expect(repo.rewards[0]?.status).toBe("issued");
  });

  it("deletes the new discount when another request already issued the reward", async () => {
    const repo = memoryRepository();
    repo.rewards.push({
      id: "reward-1",
      customerId: "customer-1",
      status: "earned",
      sequence: 1,
      promoCode: null,
      squarespaceDiscountId: null,
      validTo: null,
      redeemedOrder: null,
      redeemedRollIndex: null,
      redeemedVia: null,
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    const deleted: string[] = [];
    const discounts: DiscountClient = {
      async createDiscount(body) {
        const trigger = body.trigger as { promoCode: string };
        repo.rewards[0]!.status = "issued";
        repo.rewards[0]!.promoCode = "TMF-WINNER";
        repo.rewards[0]!.validTo = "2026-10-30T00:00:00.000Z";
        return { id: "discount-loser", promoCode: trigger.promoCode };
      },
      async deleteDiscount(id) {
        deleted.push(id);
      },
    };
    const issued = await issueOnlineCode(repo, discounts, {
      rewardId: "reward-1",
      productIds: ["dev-scan"],
      randomInt: () => 0,
    });
    expect(issued).toMatchObject({ ok: true, alreadyIssued: true, code: "TMF-WINNER" });
    expect(deleted).toEqual(["discount-loser"]);
  });
});

describe("cleanup", () => {
  const now = new Date("2026-11-10T00:00:00.000Z");

  it("redeems a used code, restores an expired unused code, and deletes spent discounts", async () => {
    const repo = memoryRepository();
    repo.rewards.push(
      {
        id: "used",
        customerId: "customer-1",
        status: "issued",
        sequence: 1,
        promoCode: "TMF-USED01",
        squarespaceDiscountId: "disc-used",
        validTo: "2026-12-01T00:00:00.000Z",
        redeemedOrder: null,
        redeemedRollIndex: null,
        redeemedVia: null,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "old",
        customerId: "customer-1",
        status: "issued",
        sequence: 2,
        promoCode: "TMF-OLD001",
        squarespaceDiscountId: "disc-old",
        validTo: "2026-11-01T00:00:00.000Z",
        redeemedOrder: null,
        redeemedRollIndex: null,
        redeemedVia: null,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    );
    const deleted: string[] = [];
    const discounts: DiscountClient = {
      async createDiscount() {
        throw new Error("not used");
      },
      async deleteDiscount(id) {
        deleted.push(id);
      },
    };
    const actions = planDiscountCleanup({
      now,
      importedPromoCodes: [],
      rewards: repo.rewards.map((reward) => ({
        id: reward.id,
        promoCode: reward.promoCode,
        squarespaceDiscountId: reward.squarespaceDiscountId,
        validTo: reward.validTo,
        status: reward.status,
      })),
      discounts: [
        { id: "disc-used", promoCode: "TMF-USED01", numberOfUses: 1, validTo: "2026-12-01T00:00:00.000Z", status: "ACTIVE" },
        { id: "disc-old", promoCode: "TMF-OLD001", numberOfUses: 0, validTo: "2026-11-01T00:00:00.000Z", status: "EXPIRED" },
        { id: "disc-orphan", promoCode: "TMF-ORPHAN", numberOfUses: 1, validTo: null, status: "ACTIVE" },
        { id: "disc-live", promoCode: "TMF-LIVE01", numberOfUses: 0, validTo: "2026-12-01T00:00:00.000Z", status: "ACTIVE" },
        { id: "sale", promoCode: "SUMMER", numberOfUses: 4, validTo: "2026-01-01T00:00:00.000Z", status: "EXPIRED" },
      ],
    });
    const result = await applyCleanupActions(repo, discounts, actions);
    expect(result.redeemed).toBe(1);
    expect(result.restored).toBe(1);
    expect(repo.rewards.find((reward) => reward.id === "used")?.status).toBe("redeemed");
    expect(repo.rewards.find((reward) => reward.id === "used")?.redeemedVia).toBe("online");
    expect(repo.rewards.find((reward) => reward.id === "old")?.status).toBe("earned");
    expect(repo.rewards.find((reward) => reward.id === "old")?.promoCode).toBeNull();
    expect(repo.events.map((event) => event.kind).sort()).toEqual(["expire", "redeem", "restore"]);
    expect(deleted).toEqual(expect.arrayContaining(["disc-used", "disc-old", "disc-orphan"]));
    expect(deleted).not.toContain("disc-live");
    expect(deleted).not.toContain("sale");

    await applyCleanupActions(repo, discounts, actions);
    expect(repo.events.filter((event) => event.kind === "redeem")).toHaveLength(1);
    expect(repo.events.filter((event) => event.kind === "restore")).toHaveLength(1);
  });

  it("redeems a code that a manual Squarespace import already stored", () => {
    const actions = planDiscountCleanup({
      now,
      importedPromoCodes: ["tmf-import"],
      rewards: [{
        id: "imported",
        promoCode: "TMF-IMPORT",
        squarespaceDiscountId: "disc-import",
        validTo: "2026-12-01T00:00:00.000Z",
        status: "issued",
      }],
      discounts: [{
        id: "disc-import",
        promoCode: "TMF-IMPORT",
        numberOfUses: 0,
        validTo: "2026-12-01T00:00:00.000Z",
        status: "ACTIVE",
      }],
    });
    expect(actions).toEqual([{ type: "redeem_online", rewardId: "imported", discountId: "disc-import" }]);
  });

  it("voids an issued code when the reward is used in the shop", async () => {
    const repo = memoryRepository();
    repo.rewards.push({
      id: "shop",
      customerId: "customer-1",
      status: "issued",
      sequence: 1,
      promoCode: "TMF-SHOP01",
      squarespaceDiscountId: "disc-shop",
      validTo: "2026-12-01T00:00:00.000Z",
      redeemedOrder: null,
      redeemedRollIndex: null,
      redeemedVia: null,
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    const deleted: string[] = [];
    const result = await markRewardRedeemed(repo, {
      async createDiscount() {
        throw new Error("not used");
      },
      async deleteDiscount(id) {
        deleted.push(id);
      },
    }, { rewardId: "shop", via: "in_store", orderId: "order-9", rollIndex: 1 });
    expect(result).toEqual({ ok: true, already: false });
    expect(deleted).toEqual(["disc-shop"]);
    expect(repo.rewards[0]).toMatchObject({
      status: "redeemed",
      redeemedVia: "in_store",
      redeemedOrder: "order-9",
      redeemedRollIndex: 1,
      promoCode: null,
    });
    const missingKey = await markRewardRedeemed(repo, null, {
      rewardId: "shop",
      via: "in_store",
      orderId: "order-9",
      rollIndex: 1,
    });
    expect(missingKey).toEqual({ ok: true, already: true });
  });
});

describe("staff adjustments and intake checks", () => {
  it("requires a reason and a non-zero roll count", () => {
    expect(validateAdjustment(2, "  lab comp  ")).toEqual({ ok: true, rolls: 2, reason: "lab comp" });
    expect(validateAdjustment(0, "nope").ok).toBe(false);
    expect(validateAdjustment(1, "  ").ok).toBe(false);
  });

  it("only applies a reward to one qualifying roll", () => {
    expect(validateInStoreRoll({
      reward: { customerId: "customer-1", status: "earned" },
      customerId: "customer-1",
      rollIndex: 1,
      rolls: [roll({ film_type: "110" }), roll({ film_type: "120" })],
      usedRollIndexes: [],
    }).ok).toBe(true);
    expect(validateInStoreRoll({
      reward: { customerId: "customer-1", status: "earned" },
      customerId: "customer-1",
      rollIndex: 0,
      rolls: [roll({ blank: true })],
      usedRollIndexes: [],
    }).ok).toBe(false);
  });

  it("parses product ids and Squarespace promo codes without treating a line item name as a code", () => {
    expect(parseRewardProductIds(" 35mm-dev, 120-dev\ndisposable-dev ")).toEqual([
      "35mm-dev",
      "120-dev",
      "disposable-dev",
    ]);
    expect(squarespaceLineProductId({ productId: "64a1", productName: "C41 (color) - 35mm Development" })).toBe("64a1");
    expect(promoCodesFromSquarespaceOrder({
      discountLines: [{ name: "Yours, free dev + high-res scan", promoCode: "tmf-k7mq2p" }],
      lineItems: [{ productName: "C41 (color) - 35mm Development", productId: "64a1" }],
    })).toEqual(["TMF-K7MQ2P"]);
  });
});

describe("squarespace errors", () => {
  it("retries when the promo code is already taken", async () => {
    const repo = memoryRepository();
    repo.rewards.push({
      id: "reward-1",
      customerId: "customer-1",
      status: "earned",
      sequence: 1,
      promoCode: null,
      squarespaceDiscountId: null,
      validTo: null,
      redeemedOrder: null,
      redeemedRollIndex: null,
      redeemedVia: null,
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    let drawn = 0;
    const randomInt = () => {
      drawn += 1;
      return drawn === 1 ? 0 : 1;
    };
    let calls = 0;
    const issued = await issueOnlineCode(repo, {
      async createDiscount(body) {
        calls += 1;
        if (calls === 1) throw new SquarespaceDiscountError("code in use", 409);
        const trigger = body.trigger as { promoCode: string };
        return { id: "discount-2", promoCode: trigger.promoCode };
      },
      async deleteDiscount() {
        throw new Error("should not delete");
      },
    }, {
      rewardId: "reward-1",
      productIds: ["dev-scan"],
      randomInt,
    });
    expect(issued.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("caps historical credit at 5 and never grants a reward from that credit alone", () => {
    expect(historicalStartingCredit(0)).toBe(0);
    expect(historicalStartingCredit(4)).toBe(4);
    expect(historicalStartingCredit(5)).toBe(5);
    expect(historicalStartingCredit(17)).toBe(5);
    expect(historicalStartingCredit(100.9)).toBe(5);
    expect(rewardBalance([{ kind: "backfill", rolls: historicalStartingCredit(40) }])).toMatchObject({
      netRolls: 5,
      rewardsOwed: 0,
      progress: 5,
    });
    expect(historicalCreditDistribution([0, 3, 5, 12, 40])).toEqual({
      customers: 5,
      byStartingCredit: { 0: 1, 1: 0, 2: 0, 3: 1, 4: 0, 5: 3 },
      rewardsFromHistory: 0,
    });
    expect(punchCardCaption(7)).toBe("7 of 10 — 3 more rolls until your free dev + high-res scan");
    expect(punchCardCaption(0)).toBe("0 of 10 — 10 more rolls until your free dev + high-res scan");
    expect(punchCardCaption(10)).toBe("10 of 10 — your free dev + high-res scan is ready");
  });

  it("does not re-add uncapped credit when a historical order is synced again", async () => {
    const repo = memoryRepository(["order-1"]);
    const historical = order({
      roll_count: 12,
      roll_details: Array.from({ length: 12 }, () => roll()),
    });
    await syncOrderEarns(repo, [historical]);
    await syncOrderEarns(repo, [historical]);
    expect(repo.events.filter((event) => event.kind === "earn")).toHaveLength(0);

    repo.events.push({
      customerId: "customer-1",
      kind: "earn",
      rolls: 12,
      orderId: "order-1",
      rewardId: null,
      reason: "old uncapped earn",
      idempotencyKey: orderEarnIdempotencyKey("order-1"),
    });
    await syncOrderEarns(repo, [{ ...historical, status: ORDER_STATUS.RECEIVED_AT_LAB }]);
    await syncOrderEarns(repo, [historical]);
    expect(repo.events.find((event) => event.kind === "earn")?.rolls).toBe(0);

    repo.events.push({
      customerId: "customer-1",
      kind: "backfill",
      rolls: 5,
      orderId: null,
      rewardId: null,
      reason: "Starting credit",
      idempotencyKey: "backfill:customer:customer-1",
    });
    await syncOrderEarns(repo, [
      historical,
      order({
        id: "order-new",
        roll_count: 6,
        roll_details: Array.from({ length: 6 }, () => roll()),
      }),
    ]);
    const earnRows = repo.events.filter((event) => event.kind === "earn" && (event.rolls ?? 0) > 0);
    expect(earnRows).toEqual([
      expect.objectContaining({ orderId: "order-new", rolls: 6 }),
    ]);
    expect(rewardBalance(repo.events)).toMatchObject({ netRolls: 11, rewardsOwed: 1, progress: 1 });
    expect(repo.rewards.filter((reward) => reward.status === "earned")).toHaveLength(1);
  });

  it("does not write a second earn when the helper sees the existing key", () => {
    const existing = new Set([orderEarnIdempotencyKey("order-1")]);
    const first = earnWritesForOrders([order()], new Set());
    const second = earnWritesForOrders([order()], existing);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]?.idempotencyKey).toBe(first[0]?.idempotencyKey);
  });
});
