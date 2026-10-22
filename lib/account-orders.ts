import { buildAccountProfile, ordersForVerifiedEmail, type AccountOrderInput, type AccountProfileData } from "@/lib/account-profile";
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
  "phone",
] as const;

export type LoadedAccount =
  | { kind: "signed-out" }
  | { kind: "ready"; profile: AccountProfileData; ordersUnavailable: boolean };

/**
 * Reads with the signed-in user's JWT so Postgres RLS applies.
 * The service-role client bypasses RLS and must not be used here.
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
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  }[]).filter((row) => row.email?.trim());
  const contact = customers.find((row) => row.email?.trim().toLowerCase() === email.toLowerCase()) ?? customers[0];

  return {
    kind: "ready",
    ordersUnavailable: Boolean(ordersResult.error),
    profile: buildAccountProfile({
      email,
      firstName: contact?.first_name,
      lastName: contact?.last_name,
      phone: contact?.phone,
      orders,
    }),
  };
}
