import { redirect } from "next/navigation";
import { getOrders } from "@/lib/db";
import { isAdminUser } from "@/lib/staff-auth";
import { createClient } from "@/lib/supabase/server";
import NumbersDashboard from "./NumbersDashboard";

export default async function Numbers() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user)) {
    redirect("/");
  }

  const orders = await getOrders("desc");

  return <NumbersDashboard orders={orders} />;
}
