import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateLink = vi.hoisted(() => vi.fn(async (): Promise<{
  data: { properties: { hashed_token: string } } | null;
  error: { message: string } | null;
}> => ({
  data: { properties: { hashed_token: "hashed-token" } },
  error: null,
})));
const from = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() => vi.fn(() => ({
  auth: { admin: { generateLink } },
  from,
})));
const fetchMock = vi.hoisted(() => vi.fn(async () => new Response(JSON.stringify({ id: "email_1" }), { status: 200 })));

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

import { ACCOUNT_SIGN_IN_SUBJECT } from "../lib/account-sign-in-email";
import { ACCOUNT_SIGN_IN_MESSAGE, POST, resetAccountSignInStateForTests } from "../app/api/account/sign-in/route";

const ORIGINAL_ENV = {
  STAFF_EMAILS: process.env.STAFF_EMAILS,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  CUSTOMER_ACCOUNTS_ENABLED: process.env.CUSTOMER_ACCOUNTS_ENABLED,
  CUSTOMER_ACCOUNT_TESTERS: process.env.CUSTOMER_ACCOUNT_TESTERS,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  REPLY_TO_EMAIL: process.env.REPLY_TO_EMAIL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function restoreEnv(name: keyof typeof ORIGINAL_ENV) {
  const value = ORIGINAL_ENV[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function restoreAccountEnv() {
  (Object.keys(ORIGINAL_ENV) as Array<keyof typeof ORIGINAL_ENV>).forEach(restoreEnv);
}

function request(email: unknown, ip = "203.0.113.10") {
  return new Request("http://localhost:3000/api/account/sign-in", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ email }),
  });
}

function sentEmail() {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.resend.com/emails");
  expect(init.method).toBe("POST");
  const headers = init.headers as Record<string, string>;
  expect(headers.Authorization).toBe("Bearer re_test");
  return JSON.parse(String(init.body)) as {
    from: string;
    to: string[];
    reply_to: string;
    subject: string;
    html: string;
    text: string;
    template?: unknown;
  };
}

describe("POST /api/account/sign-in", () => {
  beforeEach(() => {
    generateLink.mockClear();
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "hashed-token" } },
      error: null,
    });
    createClient.mockClear();
    from.mockClear();
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    resetAccountSignInStateForTests();
    process.env.STAFF_EMAILS = "owner@shop.test";
    process.env.CUSTOMER_ACCOUNTS_ENABLED = "true";
    delete process.env.CUSTOMER_ACCOUNT_TESTERS;
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "Yours Durham <no-reply@trackmyfilm.com>";
    process.env.REPLY_TO_EMAIL = "hello@yoursdurham.com";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    restoreAccountEnv();
  });

  it("mails a magic link from the app and keeps the same response", async () => {
    const res = await POST(request("  Ada@Example.com "));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-role-test",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect(generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "ada@example.com",
      options: { redirectTo: "http://localhost:3000/auth/confirm?next=/account" },
    });
    const body = sentEmail();
    expect(body).toMatchObject({
      from: "Yours Durham <no-reply@trackmyfilm.com>",
      to: ["ada@example.com"],
      reply_to: "hello@yoursdurham.com",
      subject: ACCOUNT_SIGN_IN_SUBJECT,
    });
    expect(body.template).toBeUndefined();
    expect(body.html).toContain("Sign in to Track My Film");
    expect(body.html).toContain("Sign in →");
    expect(body.html).toContain("http://localhost:3000/auth/confirm?token_hash=hashed-token&amp;type=magiclink&amp;next=%2Faccount");
    expect(body.html).toContain("http://localhost:3000/logo.png");
    expect(body.html).not.toContain("WeTransfer");
    expect(body.html).not.toContain("access your scans");
    expect(body.text).toContain("Sign in: http://localhost:3000/auth/confirm?token_hash=hashed-token&type=magiclink&next=%2Faccount");
    expect(from).not.toHaveBeenCalled();
  });

  it("uses the same message when the address is invalid, the link cannot be minted, or Resend rejects it", async () => {
    const invalid = await POST(request("not-an-email"));
    expect(await invalid.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
    expect(generateLink).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    generateLink.mockResolvedValueOnce({
      data: null,
      error: { message: "Signups not allowed for this instance" },
    });
    const refused = await POST(request("new@example.com", "203.0.113.11"));
    expect(refused.status).toBe(200);
    expect(await refused.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
    expect(fetchMock).not.toHaveBeenCalled();

    generateLink.mockResolvedValueOnce({
      data: { properties: { hashed_token: "" } },
      error: null,
    });
    const empty = await POST(request("empty@example.com", "203.0.113.15"));
    expect(await empty.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 422 }));
    const rejected = await POST(request("ada@example.com", "203.0.113.16"));
    expect(rejected.status).toBe(200);
    expect(await rejected.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
  });

  it("does not mint a link when Resend or the service role is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await POST(request("ada@example.com", "203.0.113.17"));
    expect(await res.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
    expect(generateLink).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not send a link when STAFF_EMAILS is unset, and still answers the same way", async () => {
    delete process.env.STAFF_EMAILS;
    const res = await POST(request("ada@example.com", "203.0.113.12"));
    expect(await res.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
    expect(generateLink).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rate-limits by IP without a different response", async () => {
    const ip = "203.0.113.13";
    for (let i = 0; i < 3; i += 1) {
      const res = await POST(request(`person${i}@example.com`, ip));
      expect(await res.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
    }
    expect(generateLink).toHaveBeenCalledTimes(3);
    const limited = await POST(request("person4@example.com", ip));
    expect(limited.status).toBe(200);
    expect(await limited.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
    expect(generateLink).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("prefers NEXT_PUBLIC_APP_URL for the magic-link redirect", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://trackmyfilm.com/";
    await POST(request("ada@example.com", "203.0.113.14"));
    expect(generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "ada@example.com",
      options: { redirectTo: "https://trackmyfilm.com/auth/confirm?next=/account" },
    });
    const body = sentEmail();
    expect(body.html).toContain("https://trackmyfilm.com/auth/confirm?token_hash=hashed-token&amp;type=magiclink&amp;next=%2Faccount");
    expect(body.html).toContain("https://trackmyfilm.com/logo.png");
  });

  it("escapes a token that contains HTML in the mailed link", async () => {
    generateLink.mockResolvedValueOnce({
      data: { properties: { hashed_token: "a<b>&\"c" } },
      error: null,
    });
    await POST(request("ada@example.com", "203.0.113.18"));
    const body = sentEmail();
    expect(body.html).toContain("token_hash=a%3Cb%3E%26%22c");
    expect(body.html).not.toContain("a<b>");
    expect(body.text).toContain("token_hash=a%3Cb%3E%26%22c");
    expect(body.text).not.toContain("&amp;");
  });
});

describe("POST /api/account/sign-in while accounts are hidden", () => {
  beforeEach(() => {
    generateLink.mockClear();
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "hashed-token" } },
      error: null,
    });
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    resetAccountSignInStateForTests();
    process.env.STAFF_EMAILS = "owner@shop.test";
    process.env.CUSTOMER_ACCOUNT_TESTERS = "friend@example.com";
    delete process.env.CUSTOMER_ACCOUNTS_ENABLED;
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "Yours Durham <no-reply@trackmyfilm.com>";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    restoreAccountEnv();
  });

  it("answers the same way and sends no mail for an email that is not a tester or staff", async () => {
    const res = await POST(request("ada@example.com", "203.0.113.20"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
    expect(generateLink).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a link when the address is listed in STAFF_EMAILS", async () => {
    const res = await POST(request(" Owner@Shop.test ", "203.0.113.21"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
    expect(generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "owner@shop.test",
      options: { redirectTo: "http://localhost:3000/auth/confirm?next=/account" },
    });
    expect(sentEmail().to).toEqual(["owner@shop.test"]);
  });

  it("sends a link for a tester address, ignoring case", async () => {
    const res = await POST(request(" Friend@Example.com ", "203.0.113.22"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
    expect(generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "friend@example.com",
      options: { redirectTo: "http://localhost:3000/auth/confirm?next=/account" },
    });
    expect(sentEmail().subject).toBe(ACCOUNT_SIGN_IN_SUBJECT);
  });

  it("still sends a tester link when STAFF_EMAILS is unset, and stays quiet for everyone else", async () => {
    delete process.env.STAFF_EMAILS;
    const stranger = await POST(request("ada@example.com", "203.0.113.23"));
    expect(stranger.status).toBe(200);
    expect(await stranger.json()).toEqual({ success: true, message: ACCOUNT_SIGN_IN_MESSAGE });
    expect(generateLink).not.toHaveBeenCalled();

    const tester = await POST(request("friend@example.com", "203.0.113.24"));
    expect(tester.status).toBe(200);
    expect(generateLink).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
