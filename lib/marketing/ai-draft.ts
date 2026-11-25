import { z } from "zod";
import { findUnknownTokens, parseBlocks } from "@/lib/marketing/render";
import type { EmailBlock } from "@/lib/marketing/types";

/** Cost-optimized Gateway model with structured output. Confirmed on GET /v1/models. */
export const DRAFT_MODEL = "openai/gpt-5-mini";

export const DRAFT_PROMPT_MAX = 400;
export const DRAFT_TONE_MAX = 80;
export const DRAFT_RATE_LIMIT_MAX = 5;
export const DRAFT_RATE_WINDOW_MS = 60_000;

export const DRAFT_RATE_LIMIT_MESSAGE = "Please wait a minute before asking for another draft.";
export const DRAFT_GATEWAY_MESSAGE =
  "AI drafting is not available right now. The AI Gateway may need to be turned on, or the team may need credits.";
export const DRAFT_BUSY_MESSAGE = "The drafting service is busy. Try again in a minute.";
export const DRAFT_SHAPE_MESSAGE = "The draft did not come back in a usable shape. Try again.";
export const DRAFT_FAILED_MESSAGE = "The draft could not be written. Try again in a moment.";

/**
 * Static shop facts. This is the only shop context a draft may send to the model.
 * Never append customer rows, segments, addresses, or order history.
 */
export const SHOP_CONTEXT =
  "Yours, Durham is a film lab, studio, and camera shop at 209 N. Gregson St, Durham, NC. Film developing is at https://yoursdurham.com/develop. Tracking is at https://trackmyfilm.com.";

const PLACEHOLDERS = "{{first_name}}, {{shop_name}}, and {{dropoff_count}}";

export type DraftRequest = {
  prompt: string;
  tone?: string;
};

export type MarketingDraft = {
  subject: string;
  previewText: string;
  blocks: EmailBlock[];
};

function httpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export const marketingDraftSchema = z.object({
  subject: z.string().trim().min(1).max(120).describe("Email subject. Warm and plain. No label such as SUBJECT:."),
  previewText: z.string().trim().max(140).describe("One short inbox preview line."),
  blocks: z.array(z.discriminatedUnion("type", [
    z.object({
      type: z.literal("heading"),
      text: z.string().trim().min(1).max(160).describe("Short heading. Write the shop name as Yours, with the comma."),
    }),
    z.object({
      type: z.literal("text"),
      text: z.string().trim().min(1).max(2000).describe("Body copy. Greet with Hi {{first_name}},. Say your account for the customer sign-in."),
    }),
    z.object({
      type: z.literal("button"),
      label: z.string().trim().min(1).max(40).describe("Button label, such as Open your account."),
      url: z.string().trim().max(500).refine(httpUrl, "Use an http or https link.").describe(
        "https link. Prefer https://trackmyfilm.com/account, https://yoursdurham.com/develop, or https://www.yoursdurham.com.",
      ),
    }),
  ])).min(1).max(6),
});

export function draftInstructions(): string {
  return [
    "You write one short marketing email for the shop described below.",
    SHOP_CONTEXT,
    "Voice: warm, plain, and friendly, like a person at the counter. Do not use labels that look like a terminal, a file name, or a program. Do not use .exe, all-caps headings, or prefixes such as SUBJECT:.",
    "The shop name is Yours, with the comma. When you write the name, keep the comma, as in dropped off at Yours,. You may use {{shop_name}} instead. Never write Yours without the comma, and never add a second comma after {{shop_name}}.",
    "When you mean the customer's sign-in, say your account.",
    `The only placeholders you may use are ${PLACEHOLDERS}, written exactly like that. Do not invent any other placeholder.`,
    "You are not given a mailing list, an address book, or order history. Do not invent anyone's email address, order number, or other personal detail.",
    "Use one heading, one or two text blocks, and at most one button. Start the first text block with Hi {{first_name}},.",
  ].join("\n\n");
}

/** The only request text sent to the model, besides draftInstructions(). */
export function draftUserPrompt(prompt: string, tone?: string): string {
  const lines = [`Staff note: ${prompt}`];
  if (tone) lines.push(`Tone: ${tone}`);
  return lines.join("\n");
}

export function parseDraftRequest(body: unknown): DraftRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "That draft request was not readable." };
  const record = body as { prompt?: unknown; tone?: unknown };
  if (typeof record.prompt !== "string" || !record.prompt.trim()) {
    return { error: "Write a short note about the email first." };
  }
  const prompt = record.prompt.trim();
  if (prompt.length > DRAFT_PROMPT_MAX) {
    return { error: `Keep the note under ${DRAFT_PROMPT_MAX} characters.` };
  }
  if (record.tone === undefined || record.tone === null || record.tone === "") {
    return { prompt };
  }
  if (typeof record.tone !== "string") return { error: "Keep the tone to a short phrase." };
  const tone = record.tone.trim();
  if (!tone) return { prompt };
  if (tone.length > DRAFT_TONE_MAX) return { error: "Keep the tone to a short phrase." };
  return { prompt, tone };
}

export function acceptMarketingDraft(value: unknown): MarketingDraft | { error: string } {
  const parsed = marketingDraftSchema.safeParse(value);
  if (!parsed.success) return { error: DRAFT_SHAPE_MESSAGE };
  const blocks: EmailBlock[] = parsed.data.blocks.map((block) => {
    const id = crypto.randomUUID();
    if (block.type === "button") return { id, type: "button", label: block.label, href: block.url };
    return { id, type: block.type, text: block.text };
  });
  const checked = parseBlocks(blocks);
  if ("error" in checked) return { error: DRAFT_SHAPE_MESSAGE };
  const texts = [
    parsed.data.subject,
    parsed.data.previewText,
    ...checked.flatMap((block) => block.type === "button" ? [block.label, block.href] : [block.text]),
  ];
  const unknown = [...new Set(texts.flatMap((text) => findUnknownTokens(text)))];
  if (unknown.length > 0) {
    return { error: `That draft used a placeholder this editor does not allow (${unknown.join(", ")}). Try again.` };
  }
  return {
    subject: parsed.data.subject,
    previewText: parsed.data.previewText,
    blocks: checked,
  };
}

type ErrorShape = {
  name?: string;
  message?: string;
  statusCode?: number;
  type?: string;
  responseBody?: string;
  cause?: unknown;
};

function errorShape(value: unknown): ErrorShape | null {
  if (!value || typeof value !== "object") return null;
  const record = value as ErrorShape;
  return record;
}

function flattenErrors(error: unknown): ErrorShape[] {
  const shapes: ErrorShape[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const shape = errorShape(current);
    if (!shape) break;
    shapes.push(shape);
    current = shape.cause;
  }
  return shapes;
}

/** Maps a gateway or SDK failure to a sentence staff can act on. Never returns the raw provider body. */
export function friendlyDraftFailure(error: unknown): { status: number; message: string } {
  const shapes = flattenErrors(error);
  const blob = shapes.map((shape) => [
    shape.name,
    shape.type,
    shape.message,
    shape.responseBody,
    typeof shape.statusCode === "number" ? String(shape.statusCode) : "",
  ].filter(Boolean).join(" ")).join(" ").toLowerCase();
  const statusCode = shapes.find((shape) => typeof shape.statusCode === "number")?.statusCode;
  const setup = statusCode === 401
    || statusCode === 402
    || statusCode === 403
    || blob.includes("authentication")
    || blob.includes("insufficient")
    || blob.includes("credit")
    || blob.includes("customer_verification")
    || blob.includes("oidc");
  if (setup) return { status: 503, message: DRAFT_GATEWAY_MESSAGE };
  if (statusCode === 429 || blob.includes("rate_limit") || blob.includes("rate limit")) {
    return { status: 503, message: DRAFT_BUSY_MESSAGE };
  }
  if (shapes.some((shape) => shape.name === "NoObjectGeneratedError" || shape.name === "NoOutputGeneratedError")) {
    return { status: 502, message: DRAFT_SHAPE_MESSAGE };
  }
  return { status: 502, message: DRAFT_FAILED_MESSAGE };
}

type RateLimitEntry = { count: number; resetAt: number };
const draftRateLimit = new Map<string, RateLimitEntry>();

/** True when this staff user must wait. Counts the attempt when it is allowed. */
export function draftIsRateLimited(userId: string, now = Date.now()): boolean {
  const key = userId.trim() || "unknown";
  for (const [id, entry] of draftRateLimit) {
    if (entry.resetAt <= now) draftRateLimit.delete(id);
  }
  const existing = draftRateLimit.get(key);
  if (!existing) {
    draftRateLimit.set(key, { count: 1, resetAt: now + DRAFT_RATE_WINDOW_MS });
    return false;
  }
  if (existing.count >= DRAFT_RATE_LIMIT_MAX) return true;
  existing.count += 1;
  draftRateLimit.set(key, existing);
  return false;
}

export function resetDraftRateLimitForTests() {
  draftRateLimit.clear();
}
