"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Film, Clock, CheckCircle, Package, Loader2, Users, LogOut } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import OrderCard from "@/components/OrderCard";
import NewDropoffForm from "@/components/NewDropoffForm";
import type { FilmOrder, Customer } from "@/lib/types";

const statusFilters = [
  { value: "all",                label: "All",               icon: Film },
  { value: "Received by Yours",  label: "Received by Yours", icon: Clock },
  { value: "Received at Lab",    label: "Received at Lab",   icon: Package },
  { value: "Scans Sent",         label: "Scans Sent",        icon: CheckCircle },
];

export default function Dashboard() {
  const [formOpen, setFormOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery<FilmOrder[]>({
    queryKey: ["filmOrders"],
    queryFn: () => fetch("/api/orders").then((r) => r.json()),
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers"],
    queryFn: () => fetch("/api/customers").then((r) => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/orders/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["filmOrders"] }),
  });

  const handleStatusChange = async (id: string, status: string, wetransferLink?: string, force?: boolean) => {
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: id, new_status: status, wetransfer_link: wetransferLink, force }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Order updated to ${status}`);
        queryClient.invalidateQueries({ queryKey: ["filmOrders"] });
      } else {
        toast.error(data.error || "Failed to update order");
      }
    } catch {
      toast.error("Failed to update order");
    }
  };

  const filteredOrders = orders.filter((order) => {
    const matchesFilter = activeFilter === "all" || order.status === activeFilter;
    const matchesSearch = !searchQuery ||
      order.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.order_number?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const statusCounts = {
    "Received by Yours": orders.filter((o) => o.status === "Received by Yours").length,
    "Received at Lab":   orders.filter((o) => o.status === "Received at Lab").length,
    "Scans Sent":        orders.filter((o) => o.status === "Scans Sent").length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-orange-50/30 to-amber-50/20">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-stone-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Film className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-800">Film Lab</h1>
                <p className="text-xs text-slate-500 hidden sm:block">Drop-off Tracker</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/tracking">
                <Button variant="outline" className="border-slate-200">
                  <Search className="w-4 h-4 mr-2" /> Track Order
                </Button>
              </Link>
              <Link href="/customers">
                <Button variant="outline" className="border-slate-200">
                  <Users className="w-4 h-4 mr-2" /> Customers
                </Button>
              </Link>
              <form action="/api/auth/logout" method="POST">
                <Button type="submit" variant="ghost" size="icon" title="Sign out" className="text-slate-500 hover:text-slate-700">
                  <LogOut className="w-4 h-4" />
                </Button>
              </form>
              <Button onClick={() => setFormOpen(true)}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/25">
                <Plus className="w-4 h-4 mr-2" /> New Drop-off
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Received by Yours", count: statusCounts["Received by Yours"], color: "blue" },
            { label: "Received at Lab",   count: statusCounts["Received at Lab"],   color: "amber" },
            { label: "Scans Sent",        count: statusCounts["Scans Sent"],        color: "emerald" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl p-4 shadow-sm border border-stone-100">
              <p className="text-2xl font-bold text-slate-800">{stat.count}</p>
              <p className={`text-sm text-${stat.color}-600`}>{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <Tabs value={activeFilter} onValueChange={setActiveFilter} className="w-full sm:w-auto">
            <TabsList className="border border-slate-200 bg-white h-9">
              {statusFilters.map((f) => (
                <TabsTrigger key={f.value} value={f.value} className="flex items-center gap-1.5 text-xs">
                  <f.icon className="w-3.5 h-3.5" /> {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Search by name or order #" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-stone-200" />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
              <Film className="w-8 h-8 text-stone-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-700 mb-1">No drop-offs found</h3>
            <p className="text-slate-500 mb-4">
              {searchQuery || activeFilter !== "all" ? "Try adjusting your filters" : "Add your first drop-off to get started"}
            </p>
            {!searchQuery && activeFilter === "all" && (
              <Button onClick={() => setFormOpen(true)} variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50">
                <Plus className="w-4 h-4 mr-2" /> New Drop-off
              </Button>
            )}
          </div>
        ) : (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredOrders.map((order) => (
                <motion.div key={order.id} layout
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}>
                  <OrderCard order={order} onStatusChange={handleStatusChange}
                    onDelete={(id) => deleteMutation.mutate(id)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      <NewDropoffForm open={formOpen} onOpenChange={setFormOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["filmOrders"] });
          queryClient.invalidateQueries({ queryKey: ["customers"] });
        }}
        customers={customers} />
    </div>
  );
}
