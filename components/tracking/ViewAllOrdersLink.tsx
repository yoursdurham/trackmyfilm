import Link from "next/link";

export const VIEW_ALL_ORDERS_LABEL = "View all your orders";
export const LOG_IN_TO_VIEW_ORDERS_LABEL = "Log in to view orders";

/** Signed-in customers open their account. Everyone else starts at the magic-link page. */
export function trackingAccountHref(signedIn: boolean): "/account" | "/account/login" {
  return signedIn ? "/account" : "/account/login";
}

export function LogInToViewOrdersButton({ href }: { href: "/account" | "/account/login" }) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-xl bg-[#C5AED7] px-3 font-jetbrains text-xs font-bold text-neutral-900 transition-colors hover:bg-[#b79dce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFF6D3] active:scale-[0.99] sm:h-10 sm:px-3.5 sm:text-sm"
    >
      {LOG_IN_TO_VIEW_ORDERS_LABEL}
    </Link>
  );
}

export function ViewAllOrdersLink({ href }: { href: "/account" | "/account/login" }) {
  return (
    <Link
      href={href}
      className="inline-flex rounded-md font-jetbrains text-sm font-bold text-neutral-900 underline decoration-[#C5AED7] decoration-2 underline-offset-4 transition-colors hover:decoration-[#A1CC93] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFF6D3]"
    >
      {VIEW_ALL_ORDERS_LABEL}
    </Link>
  );
}
