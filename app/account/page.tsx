import PublicHeader from "@/components/PublicHeader";
import AccountProfile from "@/components/account/AccountProfile";
import { isAccountPreview, previewAccountProfile } from "@/lib/account-profile";
import { loadAccountProfile } from "@/lib/account-orders";
import { customerAccountPageAllowed, customerAccountsEnabled } from "@/lib/customer-accounts";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const params = await searchParams;
  const accountsOpen = customerAccountsEnabled();
  if (!accountsOpen) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!customerAccountPageAllowed(user?.email)) notFound();
  } else if (isAccountPreview(params.preview)) {
    return (
      <div className="flex min-h-screen flex-col bg-[#FFF6D3] font-jetbrains text-neutral-900">
        <PublicHeader heading="p" />
        <AccountProfile profile={previewAccountProfile()} />
      </div>
    );
  }

  const loaded = await loadAccountProfile();
  if (loaded.kind === "signed-out") {
    if (!accountsOpen) notFound();
    redirect("/account/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FFF6D3] font-jetbrains text-neutral-900">
      <PublicHeader heading="p" />
      <AccountProfile
        profile={loaded.profile}
        ordersUnavailable={loaded.ordersUnavailable}
        signOutNext={accountsOpen ? "/account/login" : null}
      />
    </div>
  );
}
