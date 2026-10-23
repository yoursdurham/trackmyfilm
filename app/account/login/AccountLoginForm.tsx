"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";

const ACCOUNT_SIGN_IN_MESSAGE =
  "Check your email for a sign-in link. It may take a minute to arrive.";

const fieldClass =
  "h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 font-jetbrains text-sm text-neutral-900 outline-none focus-visible:border-neutral-900 focus-visible:ring-2 focus-visible:ring-[#C5AED7]";

const primaryButton =
  "flex h-12 w-full items-center justify-center rounded-xl bg-[#C5AED7] px-4 font-jetbrains text-sm font-bold text-neutral-900 transition-colors hover:bg-[#b79dce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:opacity-50";

export default function AccountLoginForm({ linkError }: { linkError: boolean }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        setMessage("Something went wrong. Please try again.");
        return;
      }
      const body = await response.json() as { message?: string };
      setMessage(body.message || ACCOUNT_SIGN_IN_MESSAGE);
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {linkError ? (
        <p className="rounded-xl bg-[#DDB1B1] px-3 py-2 font-jetbrains text-sm leading-relaxed text-neutral-900" role="alert">
          That sign-in link is invalid or has expired. Request a new one.
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="account-email" className="font-jetbrains text-sm font-bold text-neutral-900">Email address</Label>
        <input
          id="account-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className={fieldClass}
        />
      </div>
      <button type="submit" disabled={loading || !email} className={primaryButton}>
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending the link...</> : "Email me a link"}
      </button>
      {message ? (
        <p className="font-jetbrains text-sm leading-relaxed text-neutral-900" role="status">{message}</p>
      ) : null}
    </form>
  );
}
