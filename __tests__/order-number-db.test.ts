import { beforeEach, describe, expect, it, vi } from "vitest";
import { orderNumberMatchPattern } from "../lib/validation";

type QueryResult = { data: unknown; error: { message: string } | null };

const state: {
  calls: { table: string; method: string; args: unknown[] }[];
  result: QueryResult;
} = {
  calls: [],
  result: { data: [], error: null },
};

interface QueryBuilder {
  select: (...args: unknown[]) => QueryBuilder;
  regexIMatch: (...args: unknown[]) => QueryBuilder;
  eq: (...args: unknown[]) => QueryBuilder;
  ilike: (...args: unknown[]) => QueryBuilder;
  order: (...args: unknown[]) => QueryBuilder;
  limit: (...args: unknown[]) => QueryBuilder;
  delete: (...args: unknown[]) => QueryBuilder;
  then: (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

function builder(table: string): QueryBuilder {
  const self: QueryBuilder = {
    select(...args) {
      state.calls.push({ table, method: "select", args });
      return self;
    },
    regexIMatch(...args) {
      state.calls.push({ table, method: "regexIMatch", args });
      return self;
    },
    eq(...args) {
      state.calls.push({ table, method: "eq", args });
      return self;
    },
    ilike(...args) {
      state.calls.push({ table, method: "ilike", args });
      return self;
    },
    order(...args) {
      state.calls.push({ table, method: "order", args });
      return self;
    },
    limit(...args) {
      state.calls.push({ table, method: "limit", args });
      return self;
    },
    delete(...args) {
      state.calls.push({ table, method: "delete", args });
      return self;
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(state.result).then(onFulfilled, onRejected);
    },
  };
  return self;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => builder(table),
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

import {
  deleteIncomingDraftsForOrder,
  getIncomingDraftByOrderNumber,
  getOrderByNumber,
  getOrderByNumberAndEmail,
  orderNumberExists,
} from "../lib/db";

function patternMatches(pattern: string, stored: string): boolean {
  const source = pattern.replace(/\[\[:space:\]\]/g, "\\s");
  return new RegExp(source, "i").test(stored);
}

describe("order number database lookups", () => {
  beforeEach(() => {
    state.calls = [];
    state.result = { data: [], error: null };
  });

  it("matches 01034 to a stored 1034 and the other way around", async () => {
    state.result = {
      data: [{ id: "plain", order_number: "1034", customer_email: "ada@example.com" }],
      error: null,
    };

    const fromPadded = await getOrderByNumber("01034");
    const fromPlain = await getOrderByNumber("1034");

    expect(fromPadded?.order_number).toBe("1034");
    expect(fromPlain?.order_number).toBe("1034");
    const patterns = state.calls
      .filter((call) => call.method === "regexIMatch")
      .map((call) => String(call.args[1]));
    expect(patterns).toContain(orderNumberMatchPattern("01034"));
    expect(patterns).toContain(orderNumberMatchPattern("1034"));
    expect(patternMatches(orderNumberMatchPattern("01034"), "1034")).toBe(true);
    expect(patternMatches(orderNumberMatchPattern("1034"), "01034")).toBe(true);
    expect(state.calls.some((call) => call.method === "eq" && call.args[0] === "order_number")).toBe(false);
  });

  it("matches an all-zero order both ways and leaves prefixed numbers exact", async () => {
    state.result = {
      data: [{ id: "zero", order_number: "000" }],
      error: null,
    };
    expect((await getOrderByNumber("0"))?.order_number).toBe("000");
    expect(patternMatches(orderNumberMatchPattern("0"), "000")).toBe(true);
    expect(patternMatches(orderNumberMatchPattern("000"), "0")).toBe(true);
    expect(patternMatches(orderNumberMatchPattern("ORD-001"), "ORD-1")).toBe(false);
    expect(patternMatches(orderNumberMatchPattern("JE01034"), "JE1034")).toBe(false);

    state.calls = [];
    expect(await getOrderByNumber("   ")).toBeNull();
    expect(state.calls).toEqual([]);
  });

  it("prefers the exact stored text when both leading-zero forms exist", async () => {
    state.result = {
      data: [
        { id: "padded", order_number: "01034" },
        { id: "plain", order_number: "1034" },
      ],
      error: null,
    };
    expect((await getOrderByNumber("1034"))?.id).toBe("plain");
    expect((await getOrderByNumber("01034"))?.id).toBe("padded");
    expect((await getOrderByNumber("001034"))?.id).toBe("padded");
  });

  it("matches order number and email without requiring the same leading zeros", async () => {
    state.result = {
      data: [{ id: "plain", order_number: "1034", customer_email: "ada@example.com" }],
      error: null,
    };
    const found = await getOrderByNumberAndEmail("01034", "ada@example.com");
    expect(found?.id).toBe("plain");
    expect(state.calls.some((call) => call.method === "ilike" && call.args[0] === "customer_email")).toBe(true);
    expect(state.calls.some((call) => (
      call.method === "regexIMatch" && call.args[0] === "order_number"
    ))).toBe(true);
  });

  it("treats an existing 1034 as a duplicate of 01034", async () => {
    state.result = { data: [{ id: "plain" }], error: null };
    await expect(orderNumberExists("01034")).resolves.toBe(true);
    state.result = { data: [], error: null };
    await expect(orderNumberExists("1036")).resolves.toBe(false);
    await expect(orderNumberExists("")).resolves.toBe(false);
  });

  it("finds an intake row stored as 01034 when asked for 1034", async () => {
    state.result = {
      data: [{ id: "draft-1", squarespace_order_number: "01034" }],
      error: null,
    };
    const draft = await getIncomingDraftByOrderNumber("1034");
    expect(draft?.squarespace_order_number).toBe("01034");
    expect(state.calls.some((call) => (
      call.table === "incoming_squarespace_drafts"
      && call.method === "regexIMatch"
      && call.args[0] === "squarespace_order_number"
      && patternMatches(String(call.args[1]), "01034")
    ))).toBe(true);
  });

  it("removes an intake row whose number differs only by a leading zero", async () => {
    await deleteIncomingDraftsForOrder({ id: "order-1", order_number: "1034" });
    const numberMatch = state.calls.find((call) => (
      call.method === "regexIMatch" && call.args[0] === "squarespace_order_number"
    ));
    expect(numberMatch).toBeTruthy();
    expect(patternMatches(String(numberMatch?.args[1]), "01034")).toBe(true);
    expect(patternMatches(String(numberMatch?.args[1]), "1034")).toBe(true);
    expect(state.calls.some((call) => (
      call.method === "eq" && call.args[0] === "squarespace_order_number"
    ))).toBe(false);
  });

  it("surfaces database errors", async () => {
    state.result = { data: null, error: { message: "boom" } };
    await expect(getOrderByNumber("1034")).rejects.toThrow("boom");
  });
});
