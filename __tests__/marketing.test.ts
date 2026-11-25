import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildPeople, consentUpdate, exclusionReasons, matchesFilter, parseFilter, selectAudience, type CustomerRow, type OrderRow } from "@/lib/marketing/audience";
import { enrollmentCandidates, recheckBeforeSend, triggerEvent } from "@/lib/marketing/automations";
import {
  audienceFingerprint,
  campaignIsDue,
  confirmDecision,
  deliveryShouldSend,
  nextCampaignStatus,
  planRecipientInserts,
  retryFailedEmails,
  sendResendMessages,
  zonedLocalToUtc,
} from "@/lib/marketing/delivery";
import { aiDraftingStatus, attributeDropoffs, engagementReport } from "@/lib/marketing/metrics";
import { assertExplicitTestRecipient, listUnsubscribeHeaders, signUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/marketing/messages";
import { starterAutomations } from "@/lib/marketing/starters";
import type { FilterNode, MarketingPerson } from "@/lib/marketing/types";
import { interpretResendWebhook, patchForNotice, suppressionForNotice, verifyResendWebhook } from "@/lib/marketing/webhook";

const NOW = new Date("2026-06-01T15:00:00.000Z");

function person(overrides: Partial<MarketingPerson> = {}): MarketingPerson {
  return {
    customerId: "cust",
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    customerCreatedAt: "2026-01-01T00:00:00.000Z",
    accountCreatedAt: null,
    totalDropoffs: 1,
    totalRolls: 2,
    lastDropoffDate: "2026-05-01",
    orders: [],
    photoCount: 0,
    subscriptionStatus: "subscribed",
    suppressionReason: null,
    consentedAt: "2026-01-02T00:00:00.000Z",
    emailValid: true,
    ...overrides,
  };
}

function order(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: "order-1",
    customer_id: "cust",
    customer_email: "ada@example.com",
    status: "Scans Sent",
    dropoff_date: "2026-05-01",
    created_at: "2026-05-01T15:00:00.000Z",
    scans_sent_at: "2026-05-08T15:00:00.000Z",
    film_type: "35mm",
    film_process: "Color",
    film_stock: "Kodak Portra 400",
    ...overrides,
  };
}

describe("audience selection", () => {
  const ada = person();
  const grace = person({
    customerId: "grace",
    email: "grace@example.com",
    firstName: "Grace",
    totalDropoffs: 4,
    accountCreatedAt: "2026-02-01T00:00:00.000Z",
    subscriptionStatus: "none",
    consentedAt: null,
  });
  const people = [ada, grace];
  const hasAccount: FilterNode = { op: "condition", condition: { type: "has_account", value: true } };
  const manyDropoffs: FilterNode = { op: "condition", condition: { type: "total_dropoffs", op: "gte", value: 3 } };

  it("matches all conditions in an AND group and any condition in an OR group", () => {
    const andFilter: FilterNode = { op: "and", children: [hasAccount, manyDropoffs] };
    const orFilter: FilterNode = { op: "or", children: [hasAccount, manyDropoffs] };
    expect(matchesFilter(ada, andFilter, NOW)).toBe(false);
    expect(matchesFilter(grace, andFilter, NOW)).toBe(true);
    expect(matchesFilter(ada, orFilter, NOW)).toBe(false);
    expect(matchesFilter(grace, orFilter, NOW)).toBe(true);
    expect(matchesFilter(ada, { op: "or", children: [manyDropoffs, { op: "condition", condition: { type: "scans_sent", value: false } }] }, NOW)).toBe(true);
  });

  it("supports a nested group", () => {
    const nested: FilterNode = {
      op: "and",
      children: [
        { op: "or", children: [hasAccount, { op: "condition", condition: { type: "has_photo", value: true } }] },
        manyDropoffs,
      ],
    };
    expect(matchesFilter(grace, nested, NOW)).toBe(true);
    expect(matchesFilter(ada, nested, NOW)).toBe(false);
  });

  it("keeps an account or an order from counting as marketing consent", () => {
    const selected = selectAudience(people, { op: "and", children: [] }, NOW);
    expect(selected.recipients.map((row) => row.email)).toEqual(["ada@example.com"]);
    expect(selected.excluded.find((row) => row.person.email === "grace@example.com")?.reasons).toContain("No marketing consent");
    expect(exclusionReasons(person({ subscriptionStatus: "unsubscribed" }))).toContain("Unsubscribed");
    expect(exclusionReasons(person({ subscriptionStatus: "suppressed", suppressionReason: "bounced" }))).toContain("Bounced");
    expect(exclusionReasons(person({ subscriptionStatus: "suppressed", suppressionReason: "complained" }))).toContain("Complained");
    expect(exclusionReasons(person({ emailValid: false }))).toContain("Invalid email address");
  });

  it("rejects filters for data the shop does not record", () => {
    const parsed = parseFilter({ op: "condition", condition: { type: "lifetime_spend", value: 10 } });
    expect(parsed).toEqual({ error: expect.stringContaining("not a supported filter") });
  });

  it("builds people from customers and orders without creating a subscription", () => {
    const customers: CustomerRow[] = [{ id: "cust", email: "Ada@Example.com", first_name: "Ada", total_dropoffs: 1, total_rolls: 2 }];
    const built = buildPeople({
      customers,
      orders: [order()],
      accounts: { state: "ready", users: [] },
      photos: [],
      subscriptions: [],
    });
    expect(built[0]?.subscriptionStatus).toBe("none");
    expect(built[0]?.orders).toHaveLength(1);
    expect(selectAudience(built, { op: "and", children: [] }, NOW).recipients).toHaveLength(0);
  });
});

describe("consent and unsubscribe tokens", () => {
  it("requires an explicit yes before subscribing", () => {
    expect(consentUpdate({ status: "subscribed", explicit: false }).ok).toBe(false);
    expect(consentUpdate({ status: "subscribed", explicit: true })).toMatchObject({ ok: true, status: "subscribed" });
    expect(consentUpdate({ status: "unsubscribed", explicit: false })).toMatchObject({ ok: true, status: "unsubscribed" });
  });

  it("round-trips a signed token and rejects tampering", () => {
    const token = signUnsubscribeToken({ email: "Ada@Example.com", campaignId: "camp" }, "secret");
    expect(verifyUnsubscribeToken(token, "secret")).toMatchObject({ email: "ada@example.com", campaignId: "camp" });
    expect(verifyUnsubscribeToken(`${token}x`, "secret")).toBeNull();
    expect(verifyUnsubscribeToken(token, "other")).toBeNull();
    const headers = listUnsubscribeHeaders("https://trackmyfilm.com/email/unsubscribe?token=abc");
    expect(headers["List-Unsubscribe"]).toContain("https://trackmyfilm.com/email/unsubscribe?token=abc");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});

describe("test send", () => {
  it("accepts one typed address and refuses a list or a segment name", () => {
    expect(assertExplicitTestRecipient("Owner@Shop.test")).toBe("owner@shop.test");
    expect(assertExplicitTestRecipient(["a@b.com", "c@d.com"])).toMatchObject({ error: expect.any(String) });
    expect(assertExplicitTestRecipient("subscribers")).toMatchObject({ error: expect.any(String) });
    expect(assertExplicitTestRecipient("all")).toMatchObject({ error: expect.any(String) });
  });

  it("posts only the messages it was given, with an idempotency key", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    const [result] = await sendResendMessages({
      apiKey: "re_test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      messages: [{
        idempotencyKey: "mkt_test_owner",
        from: "Yours, <no-reply@trackmyfilm.com>",
        to: "owner@shop.test",
        subject: "Test",
        html: "<p>Hi</p>",
        text: "Hi",
        headers: listUnsubscribeHeaders("https://trackmyfilm.com/email/unsubscribe?token=abc"),
        tags: [{ name: "kind", value: "marketing_test" }],
      }],
    });
    expect(result).toMatchObject({ ok: true, resendId: "email_1" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("mkt_test_owner");
    const body = JSON.parse(String(init.body));
    expect(body.to).toEqual(["owner@shop.test"]);
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("splits a failed batch so one bad address does not hide the other", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).endsWith("/batch")) return new Response(JSON.stringify({ message: "no" }), { status: 422 });
      return new Response(JSON.stringify({ id: "one" }), { status: 200 });
    });
    const messages = ["a@example.com", "b@example.com"].map((to) => ({
      idempotencyKey: to,
      from: "Yours, <no-reply@trackmyfilm.com>",
      to,
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
      headers: {},
      tags: [],
    }));
    const results = await sendResendMessages({ apiKey: "re_test", fetchImpl: fetchImpl as unknown as typeof fetch, messages });
    expect(results.every((result) => result.ok)).toBe(true);
    expect(fetchImpl.mock.calls.length).toBe(3);
  });
});

describe("scheduling and duplicate sends", () => {
  it("reads a wall-clock time in America/New_York", () => {
    expect(zonedLocalToUtc("2026-01-15", "10:00", "America/New_York")?.toISOString()).toBe("2026-01-15T15:00:00.000Z");
    expect(zonedLocalToUtc("2026-07-15", "11:00", "America/New_York")?.toISOString()).toBe("2026-07-15T15:00:00.000Z");
  });

  it("treats a scheduled campaign as due only at or after its time", () => {
    expect(campaignIsDue({ status: "scheduled", scheduledAt: "2026-06-01T16:00:00.000Z" }, NOW)).toBe(false);
    expect(campaignIsDue({ status: "scheduled", scheduledAt: "2026-06-01T15:00:00.000Z" }, NOW)).toBe(true);
    expect(campaignIsDue({ status: "draft", scheduledAt: "2026-06-01T15:00:00.000Z" }, NOW)).toBe(false);
  });

  it("does not insert a second row for an address already on the campaign", () => {
    const plan = planRecipientInserts([{ email: "ada@example.com" }], [{ email: "ada@example.com" }, { email: "grace@example.com" }]);
    expect(plan.insert).toEqual(["grace@example.com"]);
    expect(plan.duplicates).toEqual(["ada@example.com"]);
    expect(retryFailedEmails([
      { email: "ada@example.com", status: "failed" },
      { email: "grace@example.com", status: "sent" },
    ])).toEqual(["ada@example.com"]);
    expect(deliveryShouldSend({ email: "ada@example.com", status: "sent" }, NOW)).toBe(false);
    expect(deliveryShouldSend({ email: "ada@example.com", status: "failed", attempts: 4 }, NOW)).toBe(false);
    expect(deliveryShouldSend({ email: "ada@example.com", status: "failed", attempts: 1 }, NOW)).toBe(true);
  });

  it("refuses to schedule when the reviewed list changed or nobody consented", () => {
    expect(confirmDecision({ shownFingerprint: "a", actualFingerprint: "b", recipientCount: 2 }).ok).toBe(false);
    expect(confirmDecision({ shownFingerprint: audienceFingerprint([]), actualFingerprint: audienceFingerprint([]), recipientCount: 0 }).ok).toBe(false);
    const fingerprint = audienceFingerprint(["ada@example.com"]);
    expect(confirmDecision({ shownFingerprint: fingerprint, actualFingerprint: fingerprint, recipientCount: 1 }).ok).toBe(true);
  });

  it("keeps a partial failure visible and a clean finish sent", () => {
    expect(nextCampaignStatus({ pending: 0, sending: 0, sent: 2, failed: 1 }, "sending")).toBe("failed");
    expect(nextCampaignStatus({ pending: 1, sending: 0, sent: 2, failed: 0 }, "sending")).toBe("sending");
    expect(nextCampaignStatus({ pending: 0, sending: 0, sent: 2, failed: 0 }, "sending")).toBe("sent");
  });
});

describe("webhooks", () => {
  function signed(body: string, secret = "whsec_dGVzdC1zZWNyZXQ") {
    const id = "msg_1";
    const timestamp = "1700000000";
    const key = Buffer.from("dGVzdC1zZWNyZXQ", "base64");
    const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
    return { id, timestamp, signature: `v1,${signature}`, secret };
  }

  it("accepts a matching signature and rejects a tampered body", () => {
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "re_1", to: ["ada@example.com"], tags: { delivery_id: "del_1" } } });
    const headers = signed(body);
    expect(verifyResendWebhook({ ...headers, body, nowMs: 1700000000 * 1000 }).ok).toBe(true);
    expect(verifyResendWebhook({ ...headers, body: `${body} `, nowMs: 1700000000 * 1000 }).ok).toBe(false);
    expect(verifyResendWebhook({ ...headers, body, nowMs: 1700000000 * 1000 + 600_000 }).ok).toBe(false);
  });

  it("turns bounce and complaint into suppression and leaves an open approximate", () => {
    const bounce = interpretResendWebhook({ type: "email.bounced", data: { email_id: "re_1", to: ["ada@example.com"] } });
    expect(bounce).toMatchObject({ kind: "delivery", eventType: "email.bounced" });
    if (!("kind" in bounce) || bounce.kind !== "delivery") throw new Error("expected a delivery notice");
    expect(suppressionForNotice(bounce)).toBe("bounced");
    expect(patchForNotice(bounce, "2026-06-01T15:00:00.000Z")).toEqual({ bouncedAt: "2026-06-01T15:00:00.000Z" });
    const opened = interpretResendWebhook({ type: "email.opened", data: { email_id: "re_1", to: ["ada@example.com"] } });
    if (!("kind" in opened) || opened.kind !== "delivery") throw new Error("expected an open");
    expect(suppressionForNotice(opened)).toBeNull();
    expect(patchForNotice(opened, "2026-06-01T15:00:00.000Z")).toEqual({ openedAt: "2026-06-01T15:00:00.000Z" });
  });
});

describe("automations", () => {
  const automation = starterAutomations().find((item) => item.trigger.type === "inactive")!;

  it("ships every starter disabled", () => {
    expect(starterAutomations().every((item) => item.status === "draft" && item.activatedAt === null)).toBe(true);
  });

  it("does not enroll people who were already quiet before it was turned on", () => {
    const alreadyQuiet = person({ lastDropoffDate: "2025-01-01" });
    const turnedOn = "2026-05-01T00:00:00.000Z";
    expect(triggerEvent(alreadyQuiet, { type: "inactive", days: 90 }, turnedOn, NOW)).toBeNull();
    const newlyQuiet = person({ lastDropoffDate: "2026-02-01", subscriptionStatus: "subscribed", consentedAt: "2026-01-01T00:00:00.000Z" });
    const candidates = enrollmentCandidates({
      automation: { ...automation, status: "active", activatedAt: "2026-02-15T00:00:00.000Z" },
      people: [newlyQuiet, alreadyQuiet],
      existing: [],
      now: NOW,
    });
    expect(candidates.map((row) => row.email)).toEqual(["ada@example.com"]);
  });

  it("does not enroll anyone while the automation is still a draft", () => {
    expect(enrollmentCandidates({
      automation,
      people: [person()],
      existing: [],
      now: NOW,
    })).toEqual([]);
  });

  it("exits when consent is gone or an account appears, and waits for the frequency cap", () => {
    const open: FilterNode = { op: "and", children: [] };
    const active = { ...starterAutomations()[1]!, status: "active" as const, eligibility: open };
    expect(recheckBeforeSend({
      automation: { ...active, exits: ["created_account"] },
      person: person({ accountCreatedAt: "2026-05-20T00:00:00.000Z" }),
      dueAt: "2026-05-01T00:00:00.000Z",
      enrolledAt: "2026-05-01T00:00:00.000Z",
      now: NOW,
      marketingSentAt: [],
      cap: { count: 4, windowDays: 30 },
    })).toMatchObject({ action: "exit", reason: "Created an account." });

    expect(recheckBeforeSend({
      automation: active,
      person: person({ subscriptionStatus: "unsubscribed" }),
      dueAt: "2026-05-01T00:00:00.000Z",
      enrolledAt: "2026-05-01T00:00:00.000Z",
      now: NOW,
      marketingSentAt: [],
      cap: { count: 4, windowDays: 30 },
    }).action).toBe("exit");

    expect(recheckBeforeSend({
      automation: { ...active, exits: [], cooldownDays: 0 },
      person: person(),
      dueAt: "2026-05-01T00:00:00.000Z",
      enrolledAt: "2026-05-01T00:00:00.000Z",
      now: NOW,
      marketingSentAt: ["2026-05-20T00:00:00.000Z", "2026-05-21T00:00:00.000Z", "2026-05-22T00:00:00.000Z", "2026-05-23T00:00:00.000Z"],
      cap: { count: 4, windowDays: 30 },
    })).toMatchObject({ action: "wait", reason: "Frequency cap." });

    expect(recheckBeforeSend({
      automation: { ...active, exits: [], cooldownDays: 0 },
      person: person(),
      dueAt: "2026-05-01T00:00:00.000Z",
      enrolledAt: "2026-05-01T00:00:00.000Z",
      now: NOW,
      marketingSentAt: [],
      cap: { count: 4, windowDays: 30 },
    })).toEqual({ action: "send" });
  });
});

describe("reporting", () => {
  it("keeps webhook metrics unavailable until the webhook exists, and zero once it does", () => {
    const missing = engagementReport({ webhookConfigured: false, sent: 0, delivered: 0, bounced: 0, complained: 0, unsubscribed: 0, opened: 0, clicked: 0 });
    expect(missing.sent).toEqual({ state: "value", value: 0 });
    expect(missing.opened.state).toBe("unavailable");
    const present = engagementReport({ webhookConfigured: true, sent: 2, delivered: 0, bounced: 0, complained: 0, unsubscribed: 0, opened: 0, clicked: 0 });
    expect(present.delivered).toMatchObject({ state: "value", value: 0 });
    expect(present.opened).toMatchObject({ state: "value", value: 0, note: expect.stringContaining("Approximate") });
  });

  it("counts a drop-off only after a click inside the window", () => {
    expect(attributeDropoffs({ webhookConfigured: false, clicks: null, orders: [], windowDays: 14 }).state).toBe("unavailable");
    const counted = attributeDropoffs({
      webhookConfigured: true,
      clicks: [{ email: "ada@example.com", at: "2026-05-01T00:00:00.000Z" }],
      orders: [
        { email: "ada@example.com", at: "2026-05-10T00:00:00.000Z" },
        { email: "ada@example.com", at: "2026-04-01T00:00:00.000Z" },
      ],
      windowDays: 14,
    });
    expect(counted).toMatchObject({ state: "value", value: 1 });
    expect(attributeDropoffs({ webhookConfigured: true, clicks: [], orders: [{ email: "ada@example.com", at: "2026-05-10T00:00:00.000Z" }], windowDays: 14 })).toMatchObject({ state: "value", value: 0 });
  });

  it("offers AI drafting through the editor without an OpenAI key", () => {
    const status = aiDraftingStatus();
    expect(status.available).toBe(true);
    expect(status.title).toBe("Draft with AI");
    expect(status.detail).toContain("OIDC");
    expect(status.detail).not.toContain("OPENAI");
  });
});

describe("transactional email stays separate", () => {
  it("does not consult marketing consent", () => {
    const source = readFileSync(resolve(__dirname, "../lib/email-service.ts"), "utf8");
    expect(source).not.toContain("marketing");
    expect(source).toContain("filmDropStatusNotice");
  });
});
