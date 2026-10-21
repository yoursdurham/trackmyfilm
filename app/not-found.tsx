import type { Metadata } from "next";
import Link from "next/link";
import PublicHeader from "@/components/PublicHeader";
import WindowFrame from "@/components/WindowFrame";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-[#FFF6D3] font-jetbrains text-neutral-900">
      <PublicHeader heading="p" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 pb-12">
        <WindowFrame title="Page not found" titleAs="h1" bodyClassName="p-6 sm:p-8">
          <p className="text-base leading-relaxed text-neutral-900">This page could not be found.</p>
          <Link
            href="/tracking"
            className="mt-6 flex w-full items-center justify-center rounded-xl bg-[#C5AED7] px-4 py-3 font-jetbrains text-sm font-bold text-neutral-900 transition-colors hover:bg-[#b79dce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
          >
            Back to Track My Film
          </Link>
        </WindowFrame>
      </main>
    </div>
  );
}
