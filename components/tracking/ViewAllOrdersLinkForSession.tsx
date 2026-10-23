import { ViewAllOrdersLink, trackingAccountHref } from "@/components/tracking/ViewAllOrdersLink";
import { createClient } from "@/lib/supabase/server";

/** Reads the session only. A missing session, or a failed lookup, stays on the login link. */
export async function ViewAllOrdersLinkForSession() {
  let signedIn = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  } catch {
    signedIn = false;
  }
  return <ViewAllOrdersLink href={trackingAccountHref(signedIn)} />;
}
