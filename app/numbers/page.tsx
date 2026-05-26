import { redirect } from "next/navigation";
import { getOrders } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import NumbersDashboard from "./NumbersDashboard";

function getAllowedAdminEmails() {
  return (process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminUser(user: {
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}) {
  const role = user.app_metadata?.role || user.user_metadata?.role;
  if (role === "admin") return true;

  const allowedEmails = getAllowedAdminEmails();
  return Boolean(user.email && allowedEmails.includes(user.email.toLowerCase()));
}

export default async function Numbers() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user)) {
    redirect("/");
  }

  const orders = await getOrders("desc");

  return <NumbersDashboard orders={orders} />;
}
