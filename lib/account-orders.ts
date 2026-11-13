import { buildAccountProfile, ordersForVerifiedEmail, type AccountOrderInput, type AccountProfileData } from "@/lib/account-profile";
import {
  onlineCodeAvailability,
  toAccountRewards,
  type AccountRewardsPayload,
} from "@/lib/rewards";
import { configuredProductIds, recountCustomerRewards, savedRewardProductIds } from "@/lib/rewards-db";
import { createClient } from "@/lib/supabase/server";

/**
 * Columns a signed-in customer may read. Keep this list identical to the
 * GRANT SELECT in supabase/migrations/023_customer_account_rls.sql.
 * Staff notes, hold reasons, and email delivery fields stay off the list.
 */
export const ACCOUNT_ORDER_COLUMNS = [
  "id",
  "order_number",
  "customer_name",
  "customer_email",
  "status",
  "status_history",
  "film_type",
  "film_process",
  "film_stock",
  "roll_count",
  "roll_details",
  "dropoff_date",
  "dropoff_number",
  "wetransfer_link",
  "color_scans_wetransfer_link",
  "bw_scans_wetransfer_link",
  "scan_notes",
  "received_by_yours_at",
  "scans_sent_at",
  "created_at",
] as const;

export const ACCOUNT_CUSTOMER_COLUMNS = [
  "id",
  "first_name",
  "last_name",
  "email",
] as const;

const ACCOUNT_REWARD_COLUMNS = [
  "id",
  "customer_id",
  "status",
  "promo_code",
  "valid_to",
  "redeemed_via",
  "created_at",
] as const;

const ACCOUNT_EVENT_COLUMNS = [
  "id",
  "customer_id",
  "kind",
  "rolls",
  "reward_id",
  "reason",
  "created_at",
] as const;

export type LoadedAccount =
  | { kind: "signed-out" }
  | {
    kind: "ready";
    profile: AccountProfileData;
    ordersUnavailable: boolean;
    rewards: AccountRewardsPayload | null;
    rewardsUnavailable: boolean;
  };

/**
 * Reads orders, the profile, and rewards with the signed-in user's JWT
 * so Postgres RLS applies. Counting finished rolls is a service-role write,
 * and only for customer ids this query already returned.
 */
export async function loadAccountProfile(): Promise<LoadedAccount> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email?.trim();
  if (!email) return { kind: "signed-out" };

  const [ordersResult, customerResult] = await Promise.all([
    supabase.from("film_orders").select(ACCOUNT_ORDER_COLUMNS.join(",")),
    supabase.from("customers").select(ACCOUNT_CUSTOMER_COLUMNS.join(",")),
  ]);

  if (ordersResult.error) {
    console.error("[account] orders", ordersResult.error.message);
  }
  if (customerResult.error) {
    console.error("[account] profile", customerResult.error.message);
  }

  const orders = ordersForVerifiedEmail(
    (ordersResult.data ?? []) as unknown as AccountOrderInput[],
    email,
  );
  const customers = ((customerResult.data ?? []) as unknown as {
    id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  }[]).filter((row) => row.email?.trim());
  const contact = customers.find((row) => row.email?.trim().toLowerCase() === email.toLowerCase()) ?? customers[0];
  const customerIds = customers.flatMap((row) => (
    row.id && row.email?.trim().toLowerCase() === email.toLowerCase() ? [row.id] : []
  ));
  await Promise.all(customerIds.map((customerId) => recountCustomerRewards(customerId)));

  const [rewardResult, eventResult, savedProductIds] = await Promise.all([
    supabase.from("rewards").select(ACCOUNT_REWARD_COLUMNS.join(",")),
    supabase.from("reward_events").select(ACCOUNT_EVENT_COLUMNS.join(",")),
    savedRewardProductIds().catch(() => [] as string[]),
  ]);
  const rewardsUnavailable = Boolean(rewardResult.error || eventResult.error);
  if (rewardResult.error) console.error("[account] rewards", rewardResult.error.message);
  if (eventResult.error) console.error("[account] reward events", eventResult.error.message);

  const online = onlineCodeAvailability({
    apiKey: process.env.SQUARESPACE_DISCOUNTS_API_KEY,
    productIds: configuredProductIds(savedProductIds),
  });
  const rewardRows = (rewardResult.data ?? []) as unknown as {
    id: string;
    customer_id: string;
    status: string;
    promo_code: string | null;
    valid_to: string | null;
    redeemed_via: string | null;
  }[];
  const eventRows = (eventResult.data ?? []) as unknown as {
    id: string;
    customer_id: string;
    kind: string;
    rolls: number;
    reward_id: string | null;
    reason: string | null;
    created_at: string;
  }[];
  const customerId = customerIds[0] ?? rewardRows[0]?.customer_id ?? eventRows[0]?.customer_id ?? null;
  const rewards = rewardsUnavailable
    ? null
    : toAccountRewards({
      customerId,
      onlineEnabled: online.enabled,
      onlineMessage: online.enabled ? null : online.message,
      rewards: rewardRows.map((row) => ({
        id: row.id,
        status: row.status,
        promoCode: row.promo_code,
        validTo: row.valid_to,
        redeemedVia: row.redeemed_via,
      })),
      events: eventRows.map((row) => ({
        id: row.id,
        kind: row.kind,
        rolls: row.rolls,
        reason: row.reason,
        createdAt: row.created_at,
        rewardId: row.reward_id,
      })),
    });

  return {
    kind: "ready",
    ordersUnavailable: Boolean(ordersResult.error),
    rewards,
    rewardsUnavailable,
    profile: buildAccountProfile({
      email,
      firstName: contact?.first_name,
      lastName: contact?.last_name,
      orders,
    }),
  };
}
