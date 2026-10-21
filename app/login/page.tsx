"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import RecoverySessionRedirect from "@/components/RecoverySessionRedirect";
import WindowFrame from "@/components/WindowFrame";

const fieldClass =
  "h-12 rounded-xl border-neutral-300 bg-white font-jetbrains text-sm text-neutral-900 shadow-none ring-0 focus-visible:border-neutral-900 focus-visible:ring-2 focus-visible:ring-[#C5AED7]";

const primaryButton =
  "flex h-12 w-full items-center justify-center rounded-xl bg-[#C5AED7] px-4 font-jetbrains text-sm font-bold text-neutral-900 transition-colors hover:bg-[#b79dce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:opacity-50";

const secondaryButton =
  "flex h-12 w-full items-center justify-center rounded-xl bg-[#A1CC93] px-4 font-jetbrains text-sm font-bold text-neutral-900 transition-colors hover:bg-[#8fbe80] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:opacity-50";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("redirectTo") || "";
  const redirectTo = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";

  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const resetLinkError = searchParams.get("error") === "reset"
    ? "That reset link is invalid or has expired. Request a new one."
    : searchParams.get("error") === "not-staff"
      ? "This account does not have staff access."
      : null;
  const [error, setError] = useState<string | null>(resetLinkError);
  const [success, setSuccess] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    const supabase = createClient();
    // /auth/confirm exchanges the recovery code for a session cookie, then
    // sends the browser to /login/update-password. The default Supabase email
    // appends ?code= to this URL. The token-hash template skips the code.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm`,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSuccess("Check your email for a password reset link.");
  };

  if (mode === "forgot") {
    return (
      <form onSubmit={handleForgotPassword} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className="font-jetbrains text-sm font-bold text-neutral-900">Email address</Label>
          <Input id="email" type="email" placeholder="you@yoursdurham.com"
            value={email} onChange={(e) => setEmail(e.target.value)}
            required autoFocus
            className={fieldClass} />
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border-2 border-neutral-900 bg-[#FFF6D3] p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-900" />
            <p className="text-base leading-relaxed text-neutral-900">{error}</p>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2.5 rounded-xl border-2 border-neutral-900 bg-[#A1CC93]/40 p-3">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-900" />
            <p className="text-base leading-relaxed text-neutral-900">{success}</p>
          </div>
        )}

        <button type="submit" disabled={loading || !email} className={secondaryButton}>
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</> : "Send reset link"}
        </button>

        <button type="button" onClick={() => { setMode("login"); setError(null); setSuccess(null); }}
          className="w-full rounded-xl text-center font-jetbrains text-sm font-bold text-neutral-900 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2">
          ← Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email" className="font-jetbrains text-sm font-bold text-neutral-900">Email address</Label>
        <Input id="email" type="email" placeholder="you@yoursdurham.com"
          value={email} onChange={(e) => setEmail(e.target.value)}
          required autoFocus
          className={fieldClass} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="password" className="font-jetbrains text-sm font-bold text-neutral-900">Password</Label>
          <button type="button" onClick={() => { setMode("forgot"); setError(null); }}
            className="rounded-md font-jetbrains text-xs font-bold text-neutral-900 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2">
            Forgot password?
          </button>
        </div>
        <Input id="password" type="password" placeholder="••••••••"
          value={password} onChange={(e) => setPassword(e.target.value)}
          required
          className={fieldClass} />
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border-2 border-neutral-900 bg-[#FFF6D3] p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-900" />
          <p className="text-base leading-relaxed text-neutral-900">{error}</p>
        </div>
      )}

      <button type="submit" disabled={loading || !email || !password} className={`${primaryButton} mt-2`}>
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</> : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#FFF6D3] font-jetbrains text-neutral-900">
      <RecoverySessionRedirect />
      <PublicHeader heading="p" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 pb-12">
        <WindowFrame title="Yours Durham" bodyClassName="p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <Image src="/logo.png" alt="Yours Durham" width={48} height={48} className="h-12 w-12 rounded-xl object-cover" />
            <div>
              <p className="font-jetbrains text-lg font-bold leading-tight text-neutral-900">Yours Durham</p>
              <p className="text-base leading-relaxed text-neutral-900">Film Lab · Durham, NC</p>
            </div>
          </div>

          <h1 className="font-jetbrains text-2xl font-bold text-neutral-900">Welcome back</h1>
          <p className="mb-8 mt-1 text-base leading-relaxed text-neutral-900">Sign in to access the lab dashboard</p>

          <Suspense fallback={
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-900" />
            </div>
          }>
            <LoginForm />
          </Suspense>

          <div className="mt-8 border-t border-neutral-200 pt-6">
            <p className="text-center font-jetbrains text-xs font-bold uppercase tracking-widest text-neutral-900">Staff Portal</p>
            <ul className="mt-4 space-y-2 text-center text-base leading-relaxed text-neutral-900">
              <li>Track every drop-off in real time</li>
              <li>Update status · trigger customer emails</li>
              <li>Manage your customer roll history</li>
            </ul>
          </div>
        </WindowFrame>
      </main>
    </div>
  );
}
