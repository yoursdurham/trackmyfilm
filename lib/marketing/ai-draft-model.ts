import { generateText, Output } from "ai";
import {
  DRAFT_MODEL,
  draftInstructions,
  draftUserPrompt,
  marketingDraftSchema,
  type DraftRequest,
} from "@/lib/marketing/ai-draft";

/**
 * Calls the Vercel AI Gateway. Authentication is AI_GATEWAY_API_KEY when set,
 * otherwise the Vercel OIDC token (VERCEL_OIDC_TOKEN on a deployment).
 * The request body is the static shop instructions plus the staff note and optional tone.
 */
export async function generateMarketingDraft(request: DraftRequest): Promise<unknown> {
  const { output } = await generateText({
    model: DRAFT_MODEL,
    reasoning: "low",
    instructions: draftInstructions(),
    prompt: draftUserPrompt(request.prompt, request.tone),
    output: Output.object({
      schema: marketingDraftSchema,
      name: "MarketingEmailDraft",
      description: "Subject, preview text, and blocks for one marketing email.",
    }),
    maxOutputTokens: 2000,
    maxRetries: 1,
    timeout: 30_000,
  });
  return output;
}
