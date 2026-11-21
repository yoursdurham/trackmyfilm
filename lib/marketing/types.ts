import { ORDER_STATUS } from "@/lib/constants";
import { FILM_TYPES } from "@/lib/validation";

/** Shop name, always with the comma. Never place it directly before a period. */
export const SHOP_NAME = "Yours,";

export const DEFAULT_TIMEZONE = "America/New_York";
export const DEFAULT_PHYSICAL_ADDRESS = "209 N. Gregson St, Durham, NC 27701";
export const MARKETING_CRON_UTC_HOUR = 15;
/** One process run stays small enough for a short serverless request. */
export const SEND_BATCH_LIMIT = 20;
export const DEFAULT_FREQUENCY_CAP_COUNT = 4;
export const DEFAULT_FREQUENCY_CAP_DAYS = 30;
export const DEFAULT_ATTRIBUTION_WINDOW_DAYS = 14;
export const APP_ORIGIN = "https://trackmyfilm.com";

export const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "paused",
  "failed",
  "archived",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const ORDER_STATUS_OPTIONS = [
  ORDER_STATUS.RECEIVED_BY_YOURS,
  ORDER_STATUS.RECEIVED_AT_LAB,
  ORDER_STATUS.READY_FOR_PICKUP,
  ORDER_STATUS.SCANS_SENT,
  ORDER_STATUS.ON_HOLD,
] as const;

export type CompareOp = "gte" | "lte" | "eq";

export type Condition =
  | { type: "has_account"; value: boolean }
  | { type: "total_dropoffs"; op: CompareOp; value: number }
  | { type: "total_rolls"; op: CompareOp; value: number }
  | { type: "days_since_last_dropoff"; op: "gte" | "lte"; value: number }
  | { type: "ever_status"; value: (typeof ORDER_STATUS_OPTIONS)[number] }
  | { type: "film_type"; value: (typeof FILM_TYPES)[number] }
  | { type: "film_process"; value: "Color" | "Black & White" | "Both" }
  | { type: "film_stock_contains"; value: string }
  | { type: "has_photo"; value: boolean }
  | { type: "no_account_with_dropoff" }
  | { type: "scans_sent"; value: boolean }
  | { type: "days_since_first_scans"; op: "gte" | "lte"; value: number };

export type FilterNode =
  | { op: "and" | "or"; children: FilterNode[] }
  | { op: "condition"; condition: Condition };

export type SubscriptionStatus = "subscribed" | "unsubscribed" | "suppressed" | "none";
export type SuppressionReason = "bounced" | "complained" | "invalid" | "manual";

export type MarketingOrder = {
  id: string;
  status: string;
  dropoffDate: string | null;
  createdAt: string | null;
  scansSentAt: string | null;
  receivedAt: string | null;
  atLabAt: string | null;
  filmTypes: string[];
  filmProcesses: string[];
  filmStocks: string[];
};

export type MarketingPerson = {
  customerId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  customerCreatedAt: string | null;
  accountCreatedAt: string | null;
  totalDropoffs: number;
  totalRolls: number;
  lastDropoffDate: string | null;
  orders: MarketingOrder[];
  photoCount: number;
  subscriptionStatus: SubscriptionStatus;
  suppressionReason: SuppressionReason | null;
  consentedAt: string | null;
  emailValid: boolean;
};

export type EmailBlock =
  | { id: string; type: "heading"; text: string }
  | { id: string; type: "text"; text: string }
  | { id: string; type: "button"; label: string; href: string };

export type EmailDraft = {
  subject: string;
  previewText: string;
  blocks: EmailBlock[];
  plainText: string;
};

export type Trigger =
  | { type: "account_created" }
  | { type: "dropoff_without_account" }
  | { type: "first_scans_sent" }
  | { type: "inactive"; days: number }
  | { type: "dropoff_milestone"; dropoffs: number };

export type ExitKind = "created_account" | "new_dropoff";
export type Reentry = "never" | "after_cooldown";
export type AutomationStatus = "draft" | "active" | "paused";

export type AutomationDefinition = {
  id?: string;
  name: string;
  description: string;
  status: AutomationStatus;
  trigger: Trigger;
  delayHours: number;
  eligibility: FilterNode;
  exits: ExitKind[];
  cooldownDays: number;
  reentry: Reentry;
  subject: string;
  previewText: string;
  blocks: EmailBlock[];
  plainText: string;
  activatedAt: string | null;
};

export type MetricValue =
  | { state: "value"; value: number; note?: string }
  | { state: "unavailable"; reason: string };

export const FILTER_FIELDS: {
  type: Condition["type"];
  label: string;
  help: string;
}[] = [
  {
    type: "has_account",
    label: "Has a Track My Film account",
    help: "The email matches a sign-in in Supabase Auth. A customer row or an order is not an account.",
  },
  {
    type: "no_account_with_dropoff",
    label: "Drop-off and no account",
    help: "A film order exists for this email, and there is no sign-in account for it.",
  },
  {
    type: "total_dropoffs",
    label: "Drop-off count on the customer",
    help: "Uses customers.total_dropoffs. Orders that were never saved on a customer are not in this number.",
  },
  {
    type: "total_rolls",
    label: "Roll count on the customer",
    help: "Uses customers.total_rolls.",
  },
  {
    type: "days_since_last_dropoff",
    label: "Days since last drop-off",
    help: "Uses customers.last_dropoff_date, or the latest order date when that column is empty. No date means the filter does not match.",
  },
  {
    type: "ever_status",
    label: "Order reached a status",
    help: "Received by Yours, Received at Lab, Ready for Pickup, Scans Sent, or On Hold.",
  },
  {
    type: "film_type",
    label: "Film format",
    help: "35mm, 120, 110, or Disposable Camera, from the order or a roll.",
  },
  {
    type: "film_process",
    label: "Color or black and white",
    help: "From the order or a roll.",
  },
  {
    type: "film_stock_contains",
    label: "Film stock name contains",
    help: "Matches the order film stock or a roll stock. The match is not case sensitive.",
  },
  {
    type: "scans_sent",
    label: "Scans have been sent",
    help: "An order has scans_sent_at or the status Scans Sent.",
  },
  {
    type: "days_since_first_scans",
    label: "Days since the first scans sent",
    help: "Uses the earliest scans_sent_at. No scans date means the filter does not match.",
  },
  {
    type: "has_photo",
    label: "Shared a photo",
    help: "A row exists in photo_submissions for this email. Approval is not required.",
  },
];
