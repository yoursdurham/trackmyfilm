import type { AutomationDefinition, EmailBlock } from "@/lib/marketing/types";

const WELCOME_ID = "11111111-1111-4111-8111-111111111101";
const ACCOUNT_ID = "11111111-1111-4111-8111-111111111102";
const SCANS_ID = "11111111-1111-4111-8111-111111111103";
const QUIET_ID = "11111111-1111-4111-8111-111111111104";
const MILESTONE_ID = "11111111-1111-4111-8111-111111111105";

function blocks(heading: string, text: string, label: string, href: string): EmailBlock[] {
  return [
    { id: "heading", type: "heading", text: heading },
    { id: "body", type: "text", text },
    { id: "cta", type: "button", label, href },
  ];
}

/**
 * Starter flows from events TrackMyFilm already records.
 * Every one is draft. Turning one on is a separate staff action later.
 */
export function starterAutomations(): AutomationDefinition[] {
  return [
    {
      id: WELCOME_ID,
      name: "Welcome after an account",
      description: "After a sign-in account is created. People who already had an account before you turn this on are not added.",
      status: "draft",
      trigger: { type: "account_created" },
      delayHours: 1,
      eligibility: { op: "condition", condition: { type: "has_account", value: true } },
      exits: [],
      cooldownDays: 365,
      reentry: "never",
      subject: "Your account at Yours,",
      previewText: "Your orders can live in one place.",
      blocks: blocks(
        "Your account is ready",
        "Your account can show the orders tied to this email, and the film stocks on those orders.\n\nThis note is only for people who asked Yours, for the occasional email.",
        "Open your account",
        "https://trackmyfilm.com/account",
      ),
      plainText: "",
      activatedAt: null,
    },
    {
      id: ACCOUNT_ID,
      name: "Account reminder after a drop-off",
      description: "A film order was saved and this email still has no sign-in account. The check runs again before the send.",
      status: "draft",
      trigger: { type: "dropoff_without_account" },
      delayHours: 72,
      eligibility: { op: "condition", condition: { type: "no_account_with_dropoff" } },
      exits: ["created_account"],
      cooldownDays: 180,
      reentry: "never",
      subject: "Your film is at Yours,",
      previewText: "Your account can keep this drop-off with the next one.",
      blocks: blocks(
        "Your film is with us",
        "We have a drop-off for this email. Your account can keep that order with the next one, and show the film stocks you have shot.\n\nIf you would rather not make an account, you can ignore this.",
        "Create your account",
        "https://trackmyfilm.com/account/login",
      ),
      plainText: "",
      activatedAt: null,
    },
    {
      id: SCANS_ID,
      name: "Note after the first scans",
      description: "The first time scans_sent_at is set for this email, after you turn this on.",
      status: "draft",
      trigger: { type: "first_scans_sent" },
      delayHours: 24,
      eligibility: { op: "condition", condition: { type: "scans_sent", value: true } },
      exits: [],
      cooldownDays: 365,
      reentry: "never",
      subject: "Your scans are in your account",
      previewText: "The download link is also on your order.",
      blocks: blocks(
        "Your first scans went out",
        "Your account keeps that order next to the film you dropped off. The download link stays on the order.",
        "Open your account",
        "https://trackmyfilm.com/account",
      ),
      plainText: "",
      activatedAt: null,
    },
    {
      id: QUIET_ID,
      name: "Note after a quiet stretch",
      description: "90 days after the last drop-off date. People who were already quiet before you turn this on are not added.",
      status: "draft",
      trigger: { type: "inactive", days: 90 },
      delayHours: 0,
      eligibility: { op: "condition", condition: { type: "days_since_last_dropoff", op: "gte", value: 90 } },
      exits: ["new_dropoff"],
      cooldownDays: 180,
      reentry: "after_cooldown",
      subject: "It has been a while, from Yours,",
      previewText: "The shop is on Gregson Street when you have a roll.",
      blocks: blocks(
        "We have not seen a drop-off in a while",
        "When you have a roll ready, you can bring it by the shop. Your account will still have the earlier orders.",
        "See the shop",
        "https://www.yoursdurham.com",
      ),
      plainText: "",
      activatedAt: null,
    },
    {
      id: MILESTONE_ID,
      name: "Fifth drop-off",
      description: "The film order that brings this email to 5 orders saved in TrackMyFilm. Older paper tallies are not counted, because they have no order time.",
      status: "draft",
      trigger: { type: "dropoff_milestone", dropoffs: 5 },
      delayHours: 24,
      eligibility: { op: "condition", condition: { type: "total_dropoffs", op: "gte", value: 5 } },
      exits: [],
      cooldownDays: 365,
      reentry: "never",
      subject: "Five drop-offs at Yours,",
      previewText: "Thank you for trusting us with your film.",
      blocks: blocks(
        "That is {{dropoff_count}} drop-offs",
        "Thank you for bringing your film to Yours,. Your account keeps those orders together.",
        "Open your account",
        "https://trackmyfilm.com/account",
      ),
      plainText: "",
      activatedAt: null,
    },
  ];
}

export const STARTER_IDS = [WELCOME_ID, ACCOUNT_ID, SCANS_ID, QUIET_ID, MILESTONE_ID] as const;
