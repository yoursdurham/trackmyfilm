import {
  LogInToViewOrdersButton,
  ViewAllOrdersLink,
  trackingAccountHref,
} from "@/components/tracking/ViewAllOrdersLink";
import { createClient } from "@/lib/supabase/server";

/** A missing session, or a failed lookup, stays on the login page. */
async function trackingVisitorIsSignedIn() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

export async function ViewAllOrdersLinkForSession() {
  return <ViewAllOrdersLink href={trackingAccountHref(await trackingVisitorIsSignedIn())} />;
}

export async function LogInToViewOrdersButtonForSession() {
  return <LogInToViewOrdersButton href={trackingAccountHref(await trackingVisitorIsSignedIn())} />;
}
