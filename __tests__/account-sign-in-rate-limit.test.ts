import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_SIGN_IN_RATE_LIMIT_MAX,
  isAccountSignInRateLimited,
  resetAccountSignInRateLimitForTests,
  type DurableRateLimit,
} from "../lib/account-sign-in-rate-limit";

const unavailable: DurableRateLimit = async () => "unavailable";

describe("account sign-in rate limit fallback", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetAccountSignInRateLimitForTests();
  });

  it("limits one IP across different emails when the shared store is down", async () => {
    const ip = "203.0.113.40";
    for (let i = 0; i < ACCOUNT_SIGN_IN_RATE_LIMIT_MAX; i += 1) {
      const limited = await isAccountSignInRateLimited(ip, `person${i}@example.com`, unavailable);
      expect(limited).toBe(false);
    }
    expect(await isAccountSignInRateLimited(ip, "person9@example.com", unavailable)).toBe(true);
  });

  it("limits one email across IPs when the shared store is down", async () => {
    for (let i = 0; i < ACCOUNT_SIGN_IN_RATE_LIMIT_MAX; i += 1) {
      const limited = await isAccountSignInRateLimited(`203.0.113.${i}`, "Ada@Example.com", unavailable);
      expect(limited).toBe(false);
    }
    expect(await isAccountSignInRateLimited("203.0.113.99", "ada@example.com", unavailable)).toBe(true);
  });

  it("does not let a hot IP consume someone else's email bucket", async () => {
    const hotIp = "203.0.113.50";
    for (let i = 0; i < ACCOUNT_SIGN_IN_RATE_LIMIT_MAX; i += 1) {
      expect(await isAccountSignInRateLimited(hotIp, `other${i}@example.com`, unavailable)).toBe(false);
    }
    expect(await isAccountSignInRateLimited(hotIp, "victim@example.com", unavailable)).toBe(true);
    expect(await isAccountSignInRateLimited("203.0.113.51", "victim@example.com", unavailable)).toBe(false);
  });

  it("opens a new window after a minute", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T15:00:00.000Z"));
    const ip = "203.0.113.60";
    for (let i = 0; i < ACCOUNT_SIGN_IN_RATE_LIMIT_MAX; i += 1) {
      expect(await isAccountSignInRateLimited(ip, `person${i}@example.com`, unavailable)).toBe(false);
    }
    expect(await isAccountSignInRateLimited(ip, "blocked@example.com", unavailable)).toBe(true);

    vi.setSystemTime(new Date("2026-11-07T15:01:01.000Z"));
    expect(await isAccountSignInRateLimited(ip, "later@example.com", unavailable)).toBe(false);
  });

  it("does not count an invalid address as an email bucket", async () => {
    for (let i = 0; i < ACCOUNT_SIGN_IN_RATE_LIMIT_MAX + 2; i += 1) {
      expect(await isAccountSignInRateLimited(`198.51.100.${i}`, "not-an-email", unavailable)).toBe(false);
    }
  });

  it("trusts a shared allow or refuse without also counting in memory", async () => {
    const calls: string[] = [];
    const durable: DurableRateLimit = async ({ ipBucket, emailBucket }) => {
      calls.push(`${ipBucket}|${emailBucket}`);
      return calls.length >= 4 ? "limited" : "allowed";
    };
    for (let i = 0; i < 3; i += 1) {
      expect(await isAccountSignInRateLimited("203.0.113.80", `ok${i}@example.com`, durable)).toBe(false);
    }
    expect(await isAccountSignInRateLimited("203.0.113.80", "ok3@example.com", durable)).toBe(true);
    expect(calls[0]).toBe("ip:203.0.113.80|email:ok0@example.com");

    const stillShared = await isAccountSignInRateLimited("203.0.113.80", "ok4@example.com", async () => "allowed");
    expect(stillShared).toBe(false);
  });
});

describe("account sign-in rate limit migration", () => {
  const sql = readFileSync(
    resolve(__dirname, "../supabase/migrations/031_account_sign_in_rate_limits.sql"),
    "utf8",
  );

  it("keeps the counter private and counts the IP before the email", () => {
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/force row level security/i);
    expect(sql).toMatch(/revoke all on table public\.account_sign_in_rate_limits from public, anon, authenticated/i);
    expect(sql).toMatch(/using \(false\)/);
    expect(sql).toMatch(/with check \(false\)/);
    expect(sql).not.toMatch(/film_orders/);
    expect(sql).not.toMatch(/auth\.jwt/);
    expect(sql).toMatch(
      /revoke all on function public\.consume_account_sign_in_rate_limit\(text, text, integer, integer\)\s+from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.consume_account_sign_in_rate_limit\(text, text, integer, integer\)\s+to service_role/i,
    );

    const ipGuard = sql.indexOf("if ip_count > p_max then");
    const emailInsert = sql.lastIndexOf("insert into public.account_sign_in_rate_limits");
    expect(ipGuard).toBeGreaterThan(0);
    expect(ipGuard).toBeLessThan(emailInsert);
  });
});
