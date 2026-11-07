import PublicHeader from "@/components/PublicHeader";
import WindowFrame from "@/components/WindowFrame";
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
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 pb-12">
        <WindowFrame title="Your account" titleAs="h1" bodyClassName="p-6 sm:p-8">
          <AccountLoginForm
            key={initialEmail || "blank"}
            linkError={params.error === "link"}
            initialEmail={initialEmail}
          />
        </WindowFrame>
      </main>
    </div>
  );
}
