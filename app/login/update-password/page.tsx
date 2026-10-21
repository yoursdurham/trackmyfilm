"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import WindowFrame from "@/components/WindowFrame";

const fieldClass =
  "h-12 rounded-xl border-neutral-300 bg-white font-jetbrains text-sm text-neutral-900 shadow-none ring-0 focus-visible:border-neutral-900 focus-visible:ring-2 focus-visible:ring-[#C5AED7]";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionState, setSessionState] = useState<"checking" | "ready" | "missing">("checking");

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        if (!cancelled) setSessionState("missing");
        return;
      }
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (cancelled) return;
      setSessionState(userData.user && !userError ? "ready" : "missing");
    }).catch(() => {
      if (!cancelled) setSessionState("missing");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(
        error.message === "Auth session missing!"
          ? "This reset link is no longer active. Request a new one from the sign-in page."
          : error.message,
      );
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push("/dashboard"), 2000);
  };

  return (
    <div className="min-h-screen bg-[#FFF6D3] text-neutral-900">
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
        <WindowFrame title="Set new password" titleAs="h1" bodyClassName="p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <Image src="/logo.png" alt="Yours Durham" width={44} height={44} className="h-11 w-11 rounded-xl object-cover" />
            <div>
              <p className="font-jetbrains text-lg font-bold text-neutral-900">Yours Durham</p>
              <p className="text-xs text-slate-600">Film Lab Tracker</p>
            </div>
          </div>
          <p className="mb-6 text-sm text-slate-600">Choose a new password for your account</p>

          {success ? (
            <div className="flex items-start gap-2 rounded-xl border-2 border-neutral-900 bg-[#A1CC93]/40 p-3">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-900" />
              <p className="text-sm text-neutral-900">Password updated! Redirecting to dashboard...</p>
            </div>
          ) : sessionState === "checking" ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-900" />
            </div>
          ) : sessionState === "missing" ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-xl border-2 border-neutral-900 bg-[#FFF6D3] p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-900" />
                <p className="text-sm text-neutral-900">
                  This reset link is invalid or has expired. Request a new one and open it on this device.
                </p>
              </div>
              <Link
                href="/login"
                className="block rounded-xl text-center font-jetbrains text-sm font-bold text-neutral-900 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="font-jetbrains text-sm font-bold text-neutral-900">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  className={fieldClass}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm" className="font-jetbrains text-sm font-bold text-neutral-900">Confirm Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className={fieldClass}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border-2 border-neutral-900 bg-[#FFF6D3] p-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-900" />
                  <p className="text-sm text-neutral-900">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !password || !confirm}
                className="flex h-12 w-full items-center justify-center rounded-xl bg-[#C5AED7] px-4 font-jetbrains text-sm font-bold text-neutral-900 transition-colors hover:bg-[#b79dce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</> : "Update password"}
              </button>
            </form>
          )}
        </WindowFrame>
      </main>
    </div>
  );
}
