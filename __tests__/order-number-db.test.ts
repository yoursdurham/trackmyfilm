import { beforeEach, describe, expect, it, vi } from "vitest";
import { orderNumberMatchPattern } from "../lib/validation";

type QueryResult = { data: unknown; error: { message: string; code?: string } | null };

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
  neq: (...args: unknown[]) => QueryBuilder;
  ilike: (...args: unknown[]) => QueryBuilder;
  order: (...args: unknown[]) => QueryBuilder;
  limit: (...args: unknown[]) => QueryBuilder;
  delete: (...args: unknown[]) => QueryBuilder;
  update: (...args: unknown[]) => QueryBuilder;
  single: () => Promise<QueryResult>;
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
    neq(...args) {
      state.calls.push({ table, method: "neq", args });
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
    update(...args) {
      state.calls.push({ table, method: "update", args });
      return self;
    },
    single() {
      state.calls.push({ table, method: "single", args: [] });
      return Promise.resolve(state.result);
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
  getCustomerByEmail,
  getIncomingDraftByOrderNumber,
  getOrderByNumber,
  getOrderByNumberAndEmail,
  getPendingIncomingDrafts,
  orderNumberExists,
  updateIncomingDraftStatus,
} from "../lib/db";
import { DISMISSED_STATUS_NOT_READY } from "../lib/incoming-drafts";

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
    expect(state.calls.some((call) => (
      call.method === "ilike"
      && call.args[0] === "customer_email"
      && call.args[1] === "ada@example.com"
    ))).toBe(true);
    expect(state.calls.some((call) => (
      call.method === "regexIMatch" && call.args[0] === "order_number"
    ))).toBe(true);
  });

  it("does not let % or _ wildcards match a different email", async () => {
    state.result = {
      data: [{ id: "plain", order_number: "1034", customer_email: "ada@example.com" }],
      error: null,
    };

    expect(await getOrderByNumberAndEmail("1034", "%")).toBeNull();
    expect(await getOrderByNumberAndEmail("01034", "a_a@example.com")).toBeNull();
    expect(await getOrderByNumberAndEmail("1034", "ada%@example.com")).toBeNull();
    expect((await getOrderByNumberAndEmail("01034", " ADA@example.com "))?.id).toBe("plain");

    const patterns = state.calls
      .filter((call) => call.method === "ilike" && call.args[0] === "customer_email")
      .map((call) => String(call.args[1]));
    expect(patterns).toContain("\\%");
    expect(patterns).toContain("a\\_a@example.com");
    expect(patterns).not.toContain("%");
    expect(patterns).not.toContain("a_a@example.com");
  });

  it("matches a customer email exactly and ignores wildcard input", async () => {
    state.result = {
      data: [{ id: "c1", email: "Ada@Example.com", phone: "555", notes: "staff only" }],
      error: null,
    };
    expect(await getCustomerByEmail("%")).toBeNull();
    expect(await getCustomerByEmail("ada_%")).toBeNull();
    expect((await getCustomerByEmail(" ada@example.com "))?.id).toBe("c1");
    const patterns = state.calls
      .filter((call) => call.table === "customers" && call.method === "ilike")
      .map((call) => String(call.args[1]));
    expect(patterns).toContain("\\%");
    expect(patterns).not.toContain("%");
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

  it("leaves dismissed intake rows in place when a film order is deleted", async () => {
    await deleteIncomingDraftsForOrder({ id: "order-1", order_number: "01034", external_order_id: "sq-1034" });
    const kept = state.calls.filter((call) => call.method === "neq");
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((call) => call.args[0] === "status" && call.args[1] === "dismissed")).toBe(true);
  });

  it("lists only Pending Intake rows for the queue and its count", async () => {
    state.result = {
      data: [{ id: "draft-1", status: "Pending Intake", squarespace_order_number: "01034" }],
      error: null,
    };
    const drafts = await getPendingIncomingDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.status).toBe("Pending Intake");
    expect(state.calls.some((call) => (
      call.table === "incoming_squarespace_drafts"
      && call.method === "eq"
      && call.args[0] === "status"
      && call.args[1] === "Pending Intake"
    ))).toBe(true);
  });

  it("saves dismiss on the draft row and does not delete it", async () => {
    state.result = {
      data: { id: "draft-1", status: "dismissed", squarespace_order_number: "01034" },
      error: null,
    };
    const updated = await updateIncomingDraftStatus("draft-1", "dismissed");
    expect(updated.status).toBe("dismissed");
    const write = state.calls.find((call) => call.method === "update");
    expect(write?.args[0]).toMatchObject({ status: "dismissed" });
    expect(state.calls.some((call) => call.method === "delete")).toBe(false);
  });

  it("reports that dismiss cannot be saved when the status check still rejects it", async () => {
    state.result = {
      data: null,
      error: {
        code: "23514",
        message: 'new row violates check constraint "incoming_squarespace_drafts_status_check"',
      },
    };
    await expect(updateIncomingDraftStatus("draft-1", "dismissed")).rejects.toMatchObject({
      code: DISMISSED_STATUS_NOT_READY,
    });
    expect(state.calls.some((call) => call.method === "delete")).toBe(false);
  });

  it("surfaces database errors", async () => {
    state.result = { data: null, error: { message: "boom" } };
    await expect(getOrderByNumber("1034")).rejects.toThrow("boom");
  });
});
