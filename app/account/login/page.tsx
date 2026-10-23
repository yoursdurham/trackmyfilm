import PublicHeader from "@/components/PublicHeader";
import WindowFrame from "@/components/WindowFrame";
import AccountLoginForm from "@/app/account/login/AccountLoginForm";
import { customerAccountPageAllowed } from "@/lib/customer-accounts";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AccountLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!customerAccountPageAllowed(user?.email)) notFound();
  if (user?.email) redirect("/account");

  return (
    <div className="flex min-h-screen flex-col bg-[#FFF6D3] font-jetbrains text-neutral-900">
      <PublicHeader heading="p" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 pb-12">
        <WindowFrame title="Your account" titleAs="h1" bodyClassName="p-6 sm:p-8">
          <p className="mb-6 font-jetbrains text-base leading-relaxed text-neutral-900">
            We&apos;ll email you a link. No password to remember.
          </p>
          <AccountLoginForm linkError={params.error === "link"} />
        </WindowFrame>
      </main>
    </div>
  );
}
