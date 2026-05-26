"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, DollarSign, LogOut, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import NewDropoffForm from "@/components/NewDropoffForm";
import type { Customer } from "@/lib/types";

const NEW_DROPOFF_EVENT = "tmf:new-dropoff";

export function openNewDropoffDialog() {
  window.dispatchEvent(new Event(NEW_DROPOFF_EVENT));
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Search },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/numbers", label: "Numbers", icon: DollarSign },
  { href: "/customers", label: "Customers", icon: Users },
];

export default function InternalHeader({
  title = "Yours Durham",
  subtitle = "Film Lab Tracker",
}: {
  title?: string;
  subtitle?: string;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers"],
    queryFn: async () => {
      const response = await fetch("/api/customers");
      if (!response.ok) throw new Error("Failed to fetch customers");
      return response.json();
    },
  });

  useEffect(() => {
    const open = () => setFormOpen(true);
    window.addEventListener(NEW_DROPOFF_EVENT, open);
    return () => window.removeEventListener(NEW_DROPOFF_EVENT, open);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-stone-200/50 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Image
                src="/logo.png"
                alt="Yours Durham"
                width={36}
                height={36}
                className="h-9 w-9 rounded-xl object-cover"
              />
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold text-slate-800">{title}</h1>
                <p className="hidden truncate text-xs text-slate-500 sm:block">{subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant="outline"
                      size="icon"
                      className={`border-slate-200 sm:w-auto sm:px-3 ${
                        isActive ? "bg-amber-50 text-amber-700" : ""
                      }`}
                      title={item.label}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="ml-2 hidden sm:inline">{item.label}</span>
                    </Button>
                  </Link>
                );
              })}
              <form action="/api/auth/logout" method="POST">
                <Button type="submit" variant="ghost" size="icon" title="Sign out" className="text-slate-500 hover:text-slate-700">
                  <LogOut className="h-4 w-4" />
                </Button>
              </form>
              <Button
                onClick={() => setFormOpen(true)}
                className="bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25 hover:from-amber-600 hover:to-orange-600"
              >
                <Plus className="h-4 w-4" />
                <span className="ml-2 hidden sm:inline">New Drop-off</span>
                <span className="ml-1 text-sm font-medium sm:hidden">New</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <NewDropoffForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["filmOrders"] });
          queryClient.invalidateQueries({ queryKey: ["customers"] });
        }}
        customers={customers}
      />
    </>
  );
}
