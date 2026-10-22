import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = {
  data: unknown;
  count: number | null;
  error: { message: string } | null;
};

const state: {
  calls: { table: string; method: string; args: unknown[] }[];
  result: QueryResult;
} = {
  calls: [],
  result: { data: null, count: 0, error: null },
};

interface QueryBuilder {
  select: (...args: unknown[]) => QueryBuilder;
  gte: (...args: unknown[]) => QueryBuilder;
  lt: (...args: unknown[]) => QueryBuilder;
  neq: (...args: unknown[]) => QueryBuilder;
  eq: (...args: unknown[]) => QueryBuilder;
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
    gte(...args) {
      state.calls.push({ table, method: "gte", args });
      return self;
    },
    lt(...args) {
      state.calls.push({ table, method: "lt", args });
      return self;
    },
    neq(...args) {
      state.calls.push({ table, method: "neq", args });
      return self;
    },
    eq(...args) {
      state.calls.push({ table, method: "eq", args });
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

import { countAllFilmOrders, countFilmOrdersCreatedInRange } from "@/lib/db";

describe("countFilmOrdersCreatedInRange", () => {
  beforeEach(() => {
    state.calls = [];
    state.result = { data: null, count: 681, error: null };
  });

  it("counts id only for the year range and keeps On Hold in the count", async () => {
    const count = await countFilmOrdersCreatedInRange(
      "2026-01-01T05:00:00.000Z",
      "2027-01-01T05:00:00.000Z",
    );

    expect(count).toBe(681);
    expect(state.calls.map((call) => call.method)).toEqual(["select", "gte", "lt"]);
    expect(state.calls[0]).toEqual({
      table: "film_orders",
      method: "select",
      args: ["id", { count: "exact", head: true }],
    });
    expect(state.calls[1].args).toEqual(["created_at", "2026-01-01T05:00:00.000Z"]);
    expect(state.calls[2].args).toEqual(["created_at", "2027-01-01T05:00:00.000Z"]);
    expect(state.calls.some((call) => call.method === "neq" || call.method === "eq")).toBe(false);
  });

  it("counts every film order with no date window", async () => {
    const count = await countAllFilmOrders();
    expect(count).toBe(681);
    expect(state.calls.map((call) => call.method)).toEqual(["select"]);
    expect(state.calls[0].args).toEqual(["id", { count: "exact", head: true }]);
  });

  it("throws the database error and does not invent a count", async () => {
    state.result = { data: null, count: null, error: { message: "connection refused" } };
    await expect(countFilmOrdersCreatedInRange("a", "b")).rejects.toThrow("connection refused");
  });
});
