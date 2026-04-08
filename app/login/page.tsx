"use client";

import { Suspense } from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("redirectTo") || "";
  const redirectTo = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";

  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login/update-password`,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSuccess("Check your email for a password reset link.");
  };

  if (mode === "forgot") {
    return (
      <form onSubmit={handleForgotPassword} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-slate-600 text-sm">Email address</Label>
          <Input id="email" type="email" placeholder="you@yoursdurham.com"
            value={email} onChange={(e) => setEmail(e.target.value)}
            required autoFocus
            className="h-11 border-slate-200 focus-visible:ring-amber-500" />
        </div>

        {error && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-100">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
            <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
            <p className="text-sm text-emerald-700">{success}</p>
          </div>
        )}

        <Button type="submit" disabled={loading || !email}
          className="w-full h-11 bg-amber-500 hover:bg-amber-600 text-white font-medium shadow-sm">
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : "Send reset link"}
        </Button>

        <button type="button" onClick={() => { setMode("login"); setError(null); setSuccess(null); }}
          className="w-full text-sm text-slate-400 hover:text-slate-600 text-center transition-colors">
          ← Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-slate-600 text-sm">Email address</Label>
        <Input id="email" type="email" placeholder="you@yoursdurham.com"
          value={email} onChange={(e) => setEmail(e.target.value)}
          required autoFocus
          className="h-11 border-slate-200 focus-visible:ring-amber-500" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-slate-600 text-sm">Password</Label>
          <button type="button" onClick={() => { setMode("forgot"); setError(null); }}
            className="text-xs text-amber-600 hover:text-amber-700 transition-colors">
            Forgot password?
          </button>
        </div>
        <Input id="password" type="password" placeholder="••••••••"
          value={password} onChange={(e) => setPassword(e.target.value)}
          required
          className="h-11 border-slate-200 focus-visible:ring-amber-500" />
      </div>

      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-100">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <Button type="submit" disabled={loading || !email || !password}
        className="w-full h-11 bg-amber-500 hover:bg-amber-600 text-white font-medium shadow-sm mt-2">
        {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in...</> : "Sign in"}
      </Button>
    </form>
  );
}

const SPROCKET_COUNT = 14;

export default function LoginPage() {
  return (
    <div className="min-h-screen flex">

      {/* ── Left branding panel ─────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[58%] relative flex-col overflow-hidden"
        style={{ background: "radial-gradient(ellipse at 50% 38%, rgba(217,119,6,0.12) 0%, transparent 65%), #100f0e" }}>

        {/* Film-strip sprocket holes — left edge */}
        <div className="absolute left-0 top-0 bottom-0 w-10 flex flex-col justify-around py-5">
          {Array.from({ length: SPROCKET_COUNT }).map((_, i) => (
            <div key={i} className="w-5 h-4 rounded-[3px] bg-stone-800 mx-auto ring-1 ring-stone-700" />
          ))}
        </div>

        {/* Film-strip sprocket holes — right edge */}
        <div className="absolute right-0 top-0 bottom-0 w-10 flex flex-col justify-around py-5">
          {Array.from({ length: SPROCKET_COUNT }).map((_, i) => (
            <div key={i} className="w-5 h-4 rounded-[3px] bg-stone-800 mx-auto ring-1 ring-stone-700" />
          ))}
        </div>

        {/* Centered brand content */}
        <div className="flex-1 flex flex-col items-center justify-center px-20 relative z-10">
          <img src="/logo.png" alt="Yours Durham"
            className="w-28 h-28 rounded-2xl object-cover shadow-2xl mb-8 ring-1 ring-white/10" />

          <h1 className="text-4xl font-bold text-white tracking-tight mb-2">Yours Durham</h1>
          <p className="text-stone-400 text-base mb-10">Film Lab · Durham, NC</p>

          <div className="flex items-center gap-4 w-full max-w-xs mb-10">
            <div className="h-px flex-1 bg-stone-700" />
            <span className="text-stone-600 text-xs uppercase tracking-widest">Staff Portal</span>
            <div className="h-px flex-1 bg-stone-700" />
          </div>

          <ul className="space-y-3 text-stone-500 text-sm text-center">
            <li>Track every drop-off in real time</li>
            <li>Update status · trigger customer emails</li>
            <li>Manage your customer roll history</li>
          </ul>
        </div>

        {/* Amber bottom accent */}
        <div className="absolute bottom-0 left-10 right-10 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
      </div>

      {/* ── Right form panel ────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-stone-50 p-8">
        <div className="w-full max-w-[360px]">

          {/* Mobile-only header */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <img src="/logo.png" alt="Yours Durham" className="w-10 h-10 rounded-xl object-cover" />
            <div>
              <p className="font-semibold text-slate-800 leading-tight">Yours Durham</p>
              <p className="text-xs text-slate-400">Film Lab Tracker</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h2>
          <p className="text-slate-400 text-sm mb-8">Sign in to access the lab dashboard</p>

          <Suspense fallback={
            <div className="h-48 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
            </div>
          }>
            <LoginForm />
          </Suspense>
        </div>
      </div>

    </div>
  );
}
