"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import InternalHeader from "@/components/InternalHeader";
import { isMarketingPreview } from "@/lib/marketing/access";

const LINKS = [
  { href: "/marketing", label: "Overview" },
  { href: "/marketing/customers", label: "People" },
  { href: "/marketing/segments", label: "Segments" },
  { href: "/marketing/campaigns", label: "Campaigns" },
  { href: "/marketing/templates/new", label: "Editor" },
  { href: "/marketing/automations", label: "Automations" },
  { href: "/marketing/settings", label: "Settings" },
];

export default function MarketingShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/marketing";
  const params = useSearchParams();
  const preview = isMarketingPreview(pathname, params.get("preview"));
  const suffix = preview ? "?preview=1" : "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-orange-50/30 to-amber-50/20">
      <InternalHeader title="Marketing" subtitle="Email for Yours," />
      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <nav className="flex gap-2 overflow-x-auto py-4">
          {LINKS.map((link) => {
            const active = link.href === "/marketing" ? pathname === "/marketing" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={`${link.href}${suffix}`}
                className={`rounded-full px-3 py-1 text-sm ${active ? "bg-amber-100 text-amber-800" : "bg-white text-slate-600 ring-1 ring-stone-200"}`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        {preview ? (
          <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Layout preview. This screen is not connected to the shop database. Empty areas are empty states, not live results.
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-stone-50 px-4 py-6 text-sm text-slate-600">{children}</p>;
}
