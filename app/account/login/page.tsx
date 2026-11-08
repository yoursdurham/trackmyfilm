import PublicHeader from "@/components/PublicHeader";
import WindowFrame from "@/components/WindowFrame";
import AccountLoginExplainer from "@/app/account/login/AccountLoginExplainer";
import AccountLoginForm from "@/app/account/login/AccountLoginForm";
import { accountLoginEmailPrefill } from "@/lib/account-login-prefill";
import { customerAccountPageAllowed } from "@/lib/customer-accounts";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AccountLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string | string[] }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email && customerAccountPageAllowed(user.email)) redirect("/account");

  const initialEmail = accountLoginEmailPrefill(params.email);

  return (
    <div className="flex min-h-screen flex-col bg-[#FFF6D3] font-jetbrains text-neutral-900">
      <PublicHeader heading="p" />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 pb-8 pt-1 sm:pb-12">
        <div className="mx-auto grid w-full max-w-lg items-start gap-3 md:max-w-none md:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] md:items-center md:gap-8">
          <AccountLoginExplainer />
          <WindowFrame title="Your account" titleAs="h1" bodyClassName="p-4 sm:p-6 md:p-8">
            <AccountLoginForm
              key={initialEmail || "blank"}
              linkError={params.error === "link"}
              initialEmail={initialEmail}
            />
          </WindowFrame>
        </div>
      </main>
    </div>
  );
}
