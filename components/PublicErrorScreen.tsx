"use client";

import { useEffect } from "react";
import Link from "next/link";
import PublicHeader from "@/components/PublicHeader";
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
    <div className="flex min-h-screen flex-col bg-[#FFF6D3] font-jetbrains text-neutral-900">
      <PublicHeader heading="p" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 pb-12">
        <WindowFrame title="Something went wrong" titleAs="h1" bodyClassName="p-6 sm:p-8">
          <p className="text-base leading-relaxed text-neutral-900">Please try again in a moment.</p>
          {error.digest ? (
            <p className="mt-3 font-jetbrains text-sm leading-relaxed text-neutral-800">Reference {error.digest}</p>
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
