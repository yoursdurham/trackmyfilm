import { redirect } from "next/navigation";
import { getOrders } from "@/lib/db";
import { numbersPageRedirect } from "@/lib/numbers-access";
import { createClient } from "@/lib/supabase/server";
import NumbersDashboard from "./NumbersDashboard";

export default async function Numbers() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const redirectTo = numbersPageRedirect(Boolean(user));
  if (redirectTo) redirect(redirectTo);

  const orders = await getOrders("desc");

  return <NumbersDashboard orders={orders} />;
}
