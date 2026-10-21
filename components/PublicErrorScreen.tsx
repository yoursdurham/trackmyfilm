"use client";

import { useEffect } from "react";
import Link from "next/link";
import WindowFrame from "@/components/WindowFrame";

const primaryButton =
  "mt-6 flex w-full items-center justify-center rounded-xl bg-[#C5AED7] px-4 py-3 font-jetbrains text-sm font-bold text-neutral-900 transition-colors hover:bg-[#b79dce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2";

const secondaryButton =
  "mt-3 flex w-full items-center justify-center rounded-xl bg-[#A1CC93] px-4 py-3 font-jetbrains text-sm font-bold text-neutral-900 transition-colors hover:bg-[#8fbe80] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2";

export default function PublicErrorScreen({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#FFF6D3] text-neutral-900">
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
        <WindowFrame title="Something went wrong" titleAs="h1" bodyClassName="p-6 sm:p-8">
          <p className="text-slate-600">Please try again in a moment.</p>
          {error.digest ? (
            <p className="mt-3 font-jetbrains text-xs text-slate-500">Reference {error.digest}</p>
          ) : null}
          <button type="button" onClick={() => retry()} className={primaryButton}>
            Try again
          </button>
          <Link href="/tracking" className={secondaryButton}>
            Back to Track My Film
          </Link>
        </WindowFrame>
      </main>
    </div>
  );
}
