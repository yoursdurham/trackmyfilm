import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import {
  DRAFT_BUSY_MESSAGE,
  DRAFT_FAILED_MESSAGE,
  DRAFT_GATEWAY_MESSAGE,
  DRAFT_MODEL,
  DRAFT_PROMPT_MAX,
  DRAFT_RATE_LIMIT_MAX,
  DRAFT_RATE_LIMIT_MESSAGE,
  DRAFT_SHAPE_MESSAGE,
  SHOP_CONTEXT,
  acceptMarketingDraft,
  draftInstructions,
  draftIsRateLimited,
  draftUserPrompt,
  friendlyDraftFailure,
  parseDraftRequest,
  resetDraftRateLimitForTests,
} from "@/lib/marketing/ai-draft";

const mockRequireAuth = vi.fn();
const mockGenerate = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock("@/lib/marketing/ai-draft-model", () => ({
  generateMarketingDraft: (...args: unknown[]) => mockGenerate(...args),
}));

import { POST } from "@/app/api/marketing/draft/route";

const PROMPT = "Black Friday film sale, 20% off";

function modelDraft(overrides: Record<string, unknown> = {}) {
  return {
    subject: "20% off film this weekend",
    previewText: "A short note from the shop.",
    blocks: [
      { type: "heading", text: "A note from Yours," },
      { type: "text", text: "Hi {{first_name}},\n\nDrop off at {{shop_name}} this weekend. You have {{dropoff_count}} drop-offs with us." },
      { type: "button", label: "Open your account", url: "https://trackmyfilm.com/account" },
    ],
    ...overrides,
  };
}

function postDraft(body: unknown) {
  return POST(new Request("http://localhost/api/marketing/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  resetDraftRateLimitForTests();
  mockRequireAuth.mockReset();
  mockGenerate.mockReset();
  mockRequireAuth.mockResolvedValue({ id: "staff-1", email: "owner@yoursdurham.com" });
  mockGenerate.mockResolvedValue(modelDraft());
});

describe("draft request validation", () => {
  it("keeps a short note and an optional tone", () => {
    expect(parseDraftRequest({ prompt: `  ${PROMPT}  `, tone: " warm " })).toEqual({ prompt: PROMPT, tone: "warm" });
    expect(parseDraftRequest({ prompt: PROMPT, tone: "" })).toEqual({ prompt: PROMPT });
    expect(parseDraftRequest({ prompt: PROMPT })).toEqual({ prompt: PROMPT });
  });

  it("rejects a missing, blank, or oversized note", () => {
    expect(parseDraftRequest(null)).toMatchObject({ error: expect.stringContaining("not readable") });
    expect(parseDraftRequest({ prompt: "   " })).toMatchObject({ error: expect.stringContaining("short note") });
    expect(parseDraftRequest({ prompt: "x".repeat(DRAFT_PROMPT_MAX + 1) })).toMatchObject({ error: expect.stringContaining(String(DRAFT_PROMPT_MAX)) });
    expect(parseDraftRequest({ prompt: PROMPT, tone: "x".repeat(81) })).toMatchObject({ error: expect.stringContaining("tone") });
  });
});

describe("draft output validation", () => {
  it("maps a button url onto the editor block and keeps allowed placeholders", () => {
    const draft = acceptMarketingDraft(modelDraft());
    expect("error" in draft).toBe(false);
    if ("error" in draft) return;
    expect(draft.subject).toBe("20% off film this weekend");
    expect(draft.blocks.map((block) => block.type)).toEqual(["heading", "text", "button"]);
    const button = draft.blocks[2];
    expect(button).toMatchObject({ type: "button", label: "Open your account", href: "https://trackmyfilm.com/account" });
    if (button?.type === "button") expect(button).not.toHaveProperty("url");
    expect(draft.blocks.every((block) => block.id.length > 0)).toBe(true);
  });

  it("rejects placeholders outside the editor list", () => {
    const rejected = acceptMarketingDraft(modelDraft({
      subject: "Hello {{email}}",
      blocks: [
        { type: "text", text: "Hi {{first_name}}, your {{last_name}} order is ready." },
      ],
    }));
    expect(rejected).toMatchObject({ error: expect.stringMatching(/email/) });
    expect(rejected).toMatchObject({ error: expect.stringMatching(/last_name/) });
    expect(JSON.stringify(rejected)).not.toContain("{{email}}");
  });

  it("rejects a button without an http link and a block the editor cannot store", () => {
    expect(acceptMarketingDraft(modelDraft({
      blocks: [{ type: "button", label: "Open", url: "javascript:alert(1)" }],
    }))).toEqual({ error: DRAFT_SHAPE_MESSAGE });
    expect(acceptMarketingDraft(modelDraft({
      blocks: [{ type: "html", text: "<script>" }],
    }))).toEqual({ error: DRAFT_SHAPE_MESSAGE });
    expect(acceptMarketingDraft({ subject: "Hi", previewText: "", blocks: [] })).toEqual({ error: DRAFT_SHAPE_MESSAGE });
  });
});

describe("what is sent to the model", () => {
  it("sends the staff note, optional tone, and static shop context only", () => {
    expect(draftInstructions()).toContain(SHOP_CONTEXT);
    expect(draftInstructions()).toContain("209 N. Gregson St");
    expect(draftInstructions()).toContain("https://yoursdurham.com/develop");
    expect(draftInstructions()).toContain("https://trackmyfilm.com");
    expect(draftInstructions()).toContain("{{first_name}}");
    expect(draftInstructions()).toContain("{{shop_name}}");
    expect(draftInstructions()).toContain("{{dropoff_count}}");
    expect(draftInstructions()).toContain("Yours,");
    expect(draftInstructions()).toContain("your account");
    expect(draftUserPrompt(PROMPT, "warm")).toBe(`Staff note: ${PROMPT}\nTone: warm`);
    expect(draftUserPrompt(PROMPT)).toBe(`Staff note: ${PROMPT}`);
    const sent = `${draftInstructions()}\n${draftUserPrompt(PROMPT, "warm")}`;
    expect(sent).not.toMatch(/@/);
    expect(draftInstructions.length).toBe(0);
  });

  it("does not import customer, segment, or audience data into the model call", () => {
    const model = readFileSync(resolve(__dirname, "../lib/marketing/ai-draft-model.ts"), "utf8");
    const route = readFileSync(resolve(__dirname, "../app/api/marketing/draft/route.ts"), "utf8");
    expect(model).toContain(`model: ${"DRAFT_MODEL"}`);
    expect(model).toContain("draftUserPrompt(request.prompt, request.tone)");
    expect(model).toContain("draftInstructions()");
    expect(model).not.toMatch(/audience|store|supabase|segments|people/);
    expect(model).not.toContain("OPENAI_API_KEY");
    expect(route).toContain("requireStaff");
    expect(route).toContain("generateMarketingDraft(request)");
    expect(route).not.toMatch(/audience|supabase|segments/);
    expect(DRAFT_MODEL).toBe("openai/gpt-5-mini");
  });
});

describe("gateway failures", () => {
  it("turns auth and credit failures into one friendly sentence", () => {
    expect(friendlyDraftFailure({ name: "GatewayAuthenticationError", statusCode: 401, message: "bad token ada@example.com" }).message).toBe(DRAFT_GATEWAY_MESSAGE);
    expect(friendlyDraftFailure({ name: "APICallError", statusCode: 402, message: "insufficient credits", responseBody: "ada@example.com" }).message).toBe(DRAFT_GATEWAY_MESSAGE);
    expect(friendlyDraftFailure({ name: "APICallError", statusCode: 500, cause: { name: "GatewayAuthenticationError", statusCode: 401 } }).message).toBe(DRAFT_GATEWAY_MESSAGE);
  });

  it("keeps a busy gateway and a bad shape distinct from a generic failure", () => {
    expect(friendlyDraftFailure({ name: "GatewayRateLimitError", statusCode: 429 }).message).toBe(DRAFT_BUSY_MESSAGE);
    expect(friendlyDraftFailure({ name: "NoObjectGeneratedError", message: "schema" }).message).toBe(DRAFT_SHAPE_MESSAGE);
    const generic = friendlyDraftFailure(new Error("socket hang up ada@example.com"));
    expect(generic).toEqual({ status: 502, message: DRAFT_FAILED_MESSAGE });
    expect(generic.message).not.toContain("ada@example.com");
  });
});

describe("staff draft route", () => {
  it("requires staff and does not call the model", async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    const response = await postDraft({ prompt: PROMPT });
    expect(response.status).toBe(401);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("rejects a bad note before calling the model", async () => {
    const response = await postDraft({ prompt: "  " });
    expect(response.status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("returns editor blocks and ignores customer fields on the request", async () => {
    const response = await postDraft({
      prompt: PROMPT,
      tone: "warm",
      emails: ["ada@example.com"],
      segment: "lapsed",
      people: [{ email: "ada@example.com", firstName: "Ada" }],
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.blocks[2]).toMatchObject({ type: "button", label: "Open your account", href: "https://trackmyfilm.com/account" });
    expect(body.blocks[1].text).toContain("{{first_name}}");
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledWith({ prompt: PROMPT, tone: "warm" });
    expect(JSON.stringify(mockGenerate.mock.calls[0][0])).not.toContain("ada@example.com");
    expect(JSON.stringify(body)).not.toContain("ada@example.com");
  });

  it("does not return a draft that uses a forbidden placeholder", async () => {
    mockGenerate.mockResolvedValue(modelDraft({ previewText: "Hi {{email}}" }));
    const response = await postDraft({ prompt: PROMPT });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toContain("email");
    expect(body.subject).toBeUndefined();
    expect(body.blocks).toBeUndefined();
  });

  it("rate limits a staff user after a few drafts in a minute", async () => {
    for (let i = 0; i < DRAFT_RATE_LIMIT_MAX; i += 1) {
      const response = await postDraft({ prompt: PROMPT });
      expect(response.status).toBe(200);
    }
    const limited = await postDraft({ prompt: PROMPT });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: DRAFT_RATE_LIMIT_MESSAGE });
    expect(mockGenerate).toHaveBeenCalledTimes(DRAFT_RATE_LIMIT_MAX);
    mockRequireAuth.mockResolvedValue({ id: "staff-2", email: "other@yoursdurham.com" });
    expect((await postDraft({ prompt: PROMPT })).status).toBe(200);
  });

  it("answers a gateway failure without the provider body", async () => {
    mockGenerate.mockRejectedValue({ name: "APICallError", statusCode: 402, message: "insufficient credits for ada@example.com" });
    const response = await postDraft({ prompt: PROMPT });
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe(DRAFT_GATEWAY_MESSAGE);
    expect(body.error).not.toContain("ada@example.com");
  });
});

describe("draft rate limit helper", () => {
  it("allows a few calls per window and then waits", () => {
    const now = 1_000;
    for (let i = 0; i < DRAFT_RATE_LIMIT_MAX; i += 1) expect(draftIsRateLimited("staff-1", now)).toBe(false);
    expect(draftIsRateLimited("staff-1", now)).toBe(true);
    expect(draftIsRateLimited("staff-1", now + 60_000)).toBe(false);
  });
});

describe("editor copy", () => {
  it("names the shop placeholder without a doubled comma and offers Draft with AI", () => {
    const source = readFileSync(resolve(__dirname, "../components/marketing/EditorScreen.tsx"), "utf8");
    expect(source).toContain('{"{{shop_name}}"} is “Yours,”');
    expect(source).not.toContain("is {SHOP_NAME},");
    expect(source).toContain('title="Draft with AI"');
    expect(source).not.toContain("AI drafting needs a provider");
    expect(source).toContain("Replace the subject, preview text, and blocks with this draft?");
    expect(source).toContain("Drafting…");
  });
});
