import Image from "next/image";
import Link from "next/link";

type PublicHeaderProps = {
  /** The tracking page uses this title as its h1. Other public pages keep their own. */
  heading?: "h1" | "p";
};

export default function PublicHeader({ heading = "h1" }: PublicHeaderProps) {
  const Tag = heading;

  return (
    <header className="bg-[#FFF6D3]">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 pb-8 pt-8 text-center sm:gap-4 sm:px-6 lg:flex-row lg:justify-center lg:gap-6 lg:px-8 lg:pb-10 lg:pt-10 lg:text-left">
        <Link
          href="/tracking"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFF6D3]"
        >
          <Image
            src="/yours-wordmark.png"
            alt="Yours, Durham"
            width={1400}
            height={620}
            preload
            sizes="(min-width: 1024px) 280px, 220px"
            className="h-16 w-auto sm:h-20 lg:h-24"
          />
        </Link>
        <Tag className="font-jetbrains text-sm font-bold leading-snug tracking-tight text-neutral-900 sm:text-xl lg:whitespace-nowrap">
          Track My Film
          <span className="ml-1 font-normal text-neutral-800 sm:ml-2">
            - A Project by Yours, Durham
          </span>
        </Tag>
      </div>
    </header>
  );
}
