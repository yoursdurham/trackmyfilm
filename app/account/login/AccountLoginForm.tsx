"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  ACCOUNT_EMAIL_OTP_INVALID,
  ACCOUNT_EMAIL_OTP_LABEL,
  ACCOUNT_EMAIL_OTP_LENGTH,
  normalizeAccountEmailOtp,
  verifyAccountEmailCode,
} from "@/lib/account-email-otp";
import { createClient } from "@/lib/supabase/client";

const fieldClass =
  "h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 font-jetbrains text-sm text-neutral-900 outline-none focus-visible:border-neutral-900 focus-visible:ring-2 focus-visible:ring-[#C5AED7]";

const codeFieldClass =
  "h-14 w-full rounded-xl border border-neutral-300 bg-white pl-[0.35em] text-center font-jetbrains text-2xl font-bold tracking-[0.35em] text-neutral-900 outline-none focus-visible:border-neutral-900 focus-visible:ring-2 focus-visible:ring-[#C5AED7]";

const primaryButton =
  "flex h-12 w-full items-center justify-center rounded-xl bg-[#C5AED7] px-4 font-jetbrains text-sm font-bold text-neutral-900 transition-colors hover:bg-[#b79dce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:opacity-50";

const quietLink =
  "font-jetbrains text-sm text-neutral-900 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:opacity-50";

export function AccountEmailCodeStep({
  email,
  code,
  loading,
  resending,
  error,
  onCodeChange,
  onSubmit,
  onUseDifferentEmail,
  onResend,
}: {
  email: string;
  code: string;
  loading: boolean;
  resending: boolean;
  error: string | null;
  onCodeChange: (code: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onUseDifferentEmail: () => void;
  onResend: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <h2 className="font-jetbrains text-xl font-bold text-neutral-900">Check your email</h2>
        <p className="font-jetbrains text-sm leading-relaxed text-neutral-900" role="status">
          We sent a sign-in link to <strong className="break-all">{email}</strong>. Tap the link, or enter the 6-digit code below.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="account-email-code" className="sr-only">
          {ACCOUNT_EMAIL_OTP_LABEL}
        </Label>
        <input
          id="account-email-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoCorrect="off"
          spellCheck={false}
          pattern={`[0-9]{${ACCOUNT_EMAIL_OTP_LENGTH}}`}
          maxLength={ACCOUNT_EMAIL_OTP_LENGTH}
          placeholder="000000"
          value={code}
          onChange={(event) => onCodeChange(normalizeAccountEmailOtp(event.target.value))}
          aria-invalid={error ? true : undefined}
          required
          className={codeFieldClass}
        />
      </div>
      {error ? (
        <p className="rounded-xl bg-[#DDB1B1] px-3 py-2 font-jetbrains text-sm leading-relaxed text-neutral-900" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={loading || resending || code.length !== ACCOUNT_EMAIL_OTP_LENGTH} className={primaryButton}>
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking the code...</> : "Sign in"}
      </button>
      <p className="text-center">
        <button type="button" onClick={onUseDifferentEmail} className={quietLink}>
          Use a different email
        </button>
        <span aria-hidden="true" className="px-2 text-neutral-900">/</span>
        <button type="button" onClick={onResend} disabled={loading || resending} className={quietLink}>
          {resending ? "Sending..." : "Resend"}
        </button>
      </p>
    </form>
  );
}

export default function AccountLoginForm({ linkError }: { linkError: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [step, setStep] = useState<"email" | "code">("email");

  const requestLink = async () => {
    const response = await fetch("/api/account/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      throw new Error("sign-in request failed");
    }
    // The body is the same sentence for every address. The code step does not
    // read it, so a missing account looks the same as a sent link.
    await response.json().catch(() => null);
    setCode("");
    setCodeError(null);
    setMessage(null);
    setStep("code");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      await requestLink();
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setCodeError(null);
    try {
      await requestLink();
    } catch {
      setCodeError("Something went wrong. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const handleCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setCodeError(null);
    try {
      const result = await verifyAccountEmailCode(
        (params) => createClient().auth.verifyOtp(params),
        email,
        code,
      );
      if (!result.ok) {
        setCodeError(result.message);
        return;
      }
      router.push("/account");
      router.refresh();
    } catch {
      setCodeError(ACCOUNT_EMAIL_OTP_INVALID);
    } finally {
      setLoading(false);
    }
  };

  if (step === "code") {
    return (
      <AccountEmailCodeStep
        email={email}
        code={code}
        loading={loading}
        resending={resending}
        error={codeError}
        onCodeChange={setCode}
        onSubmit={handleCode}
        onUseDifferentEmail={() => {
          setStep("email");
          setCode("");
          setCodeError(null);
          setMessage(null);
        }}
        onResend={handleResend}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="font-jetbrains text-base leading-relaxed text-neutral-900">
        We&apos;ll email you a link and a 6-digit code. No password to remember.
      </p>
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
