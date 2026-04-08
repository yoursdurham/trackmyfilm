"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Film, Search, Loader2, Calendar, Layers, Package, CheckCircle, Clock, Download, ExternalLink, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import type { FilmOrder } from "@/lib/types";

const statusSteps = [
  { status: "Received by Yours", icon: Clock,       activeBg: "bg-blue-500",    activeRing: "ring-blue-200",    activeText: "text-blue-700",    activeLine: "bg-blue-500" },
  { status: "Received at Lab",   icon: Package,     activeBg: "bg-amber-500",   activeRing: "ring-amber-200",   activeText: "text-amber-700",   activeLine: "bg-amber-500" },
  { status: "Scans Sent",        icon: CheckCircle, activeBg: "bg-emerald-500", activeRing: "ring-emerald-200", activeText: "text-emerald-700", activeLine: "bg-emerald-500" },
] as const;

function OrderTimeline({ currentStatus, statusHistory }: {
  currentStatus: string;
  statusHistory?: { status: string; changed_at: string }[];
}) {
  const currentIndex = statusSteps.findIndex((s) => s.status === currentStatus);

  // Pre-compute timestamp map once instead of searching on every step render
  const timestampMap = statusHistory
    ? Object.fromEntries(
        [...statusHistory].reverse().map((h) => [h.status, format(new Date(h.changed_at), "MMM d, h:mm a")])
      )
    : {};

  return (
    <div className="flex items-center justify-between max-w-2xl mx-auto mb-8">
      {statusSteps.map((step, index) => {
        const Icon = step.icon;
        const isActive = index <= currentIndex;
        const isCurrent = index === currentIndex;
        const timestamp = timestampMap[step.status];
        return (
          <div key={step.status} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all ${
                isActive ? `${step.activeBg} shadow-lg` : "bg-slate-200"
              } ${isCurrent ? `ring-4 ${step.activeRing}` : ""}`}>
                <Icon className={`w-4 h-4 sm:w-6 sm:h-6 ${isActive ? "text-white" : "text-slate-400"}`} />
              </div>
              <p className={`text-xs mt-2 text-center max-w-[100px] ${
                isActive ? `${step.activeText} font-medium` : "text-slate-400"
              }`}>{step.status}</p>
              {timestamp && (
                <p className="text-xs text-slate-400 mt-0.5 text-center max-w-[100px]">{timestamp}</p>
              )}
            </div>
            {index < statusSteps.length - 1 && (
              <div className={`flex-1 h-1 mx-2 rounded-full transition-all ${
                index < currentIndex ? `${step.activeLine}` : "bg-slate-200"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

type CommittedSearch = { term: string; type: "order" | "email" };

export default function Tracking() {
  const [searchTerm, setSearchTerm] = useState("");
  const [committed, setCommitted] = useState<CommittedSearch | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);

  const { data: orders = [], isLoading } = useQuery<FilmOrder[]>({
    queryKey: ["trackOrders", committed?.term, committed?.type],
    queryFn: async () => {
      if (!committed) return [];
      const param = committed.type === "order"
        ? `order_number=${encodeURIComponent(committed.term)}`
        : `email=${encodeURIComponent(committed.term)}`;
      const res = await fetch(`/api/orders/track?${param}`);
      if (!res.ok) throw new Error("Failed to fetch orders");
      const data = await res.json();
      if (committed.type === "email" && data.customer) {
        setCustomerName(`${data.customer.name} ${data.customer.last_name ?? ""}`.trim());
        return data.orders ?? [];
      }
      setCustomerName(null);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!committed,
  });

  const hasSearched = !!committed;

  const handleSearch = (type: "order" | "email") => {
    setCommitted({ term: searchTerm, type });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-orange-50/30 to-amber-50/20">
      <header className="bg-white/80 backdrop-blur-lg border-b border-stone-200/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3 mb-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <img
              src="/logo.png"
              alt="Yours Durham"
              className="w-10 h-10 rounded-xl object-cover"
            />
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Track Your Order</h1>
              <p className="text-sm text-slate-500">Enter your order number or email to check status</p>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            Order number is on your original confirmation email or if you purchased in store it will be your first/last initials and last 4 of your phone number example: (JE1234)
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="bg-white shadow-lg border-0 mb-8">
          <CardContent className="p-6">
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input placeholder="Enter order number or email..." value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && searchTerm) {
                      handleSearch(searchTerm.includes("@") ? "email" : "order");
                    }
                  }}
                  className="pl-11 h-12 text-lg" />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={() => handleSearch("order")} disabled={!searchTerm || isLoading}
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                Track by Order #
              </Button>
              <Button onClick={() => handleSearch("email")} disabled={!searchTerm || isLoading}
                variant="outline" className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-50">
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                Track by Email
              </Button>
            </div>
          </CardContent>
        </Card>

        <AnimatePresence mode="wait">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            </div>
          ) : hasSearched && orders.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="text-center py-20">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Film className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-700 mb-1">No orders found</h3>
              <p className="text-slate-500">
                {committed?.type === "email" ? "No orders found for this email address" : "Order number not found. Please check and try again."}
              </p>
            </motion.div>
          ) : orders.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="space-y-6">
              {customerName && (
                <p className="text-slate-600 font-medium">Showing orders for <strong>{customerName}</strong></p>
              )}
              {orders.map((order) => (
                <Card key={order.id} className="bg-white shadow-md border-0 overflow-hidden">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-6">
                      <div>
                        <h2 className="text-xl font-bold text-slate-800 mb-1">Order #{order.order_number}</h2>
                        <p className="text-slate-600">{order.customer_name}</p>
                      </div>
                      <div className={`px-4 py-2 rounded-full text-sm font-medium ${
                        order.status === "Received by Yours" ? "bg-blue-100 text-blue-700" :
                        order.status === "Received at Lab"   ? "bg-amber-100 text-amber-700" :
                        "bg-emerald-100 text-emerald-700"
                      }`}>{order.status}</div>
                    </div>

                    <OrderTimeline currentStatus={order.status} statusHistory={order.status_history} />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 border-t border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                          <Calendar className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Dropped off</p>
                          <p className="text-sm font-medium text-slate-800">
                            {format(new Date(order.dropoff_date), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                          <Layers className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Number of rolls</p>
                          <p className="text-sm font-medium text-slate-800">
                            {order.roll_count} roll{order.roll_count > 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                    </div>

                    {order.status === "Scans Sent" && order.wetransfer_link && (
                      <div className="pt-4 border-t border-slate-100 mt-4">
                        <a href={order.wetransfer_link} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white rounded-lg font-medium transition-all shadow-md hover:shadow-lg">
                          <Download className="w-5 h-5" />
                          Download Your Scans
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-12 mb-8">
          <h2 className="text-2xl font-bold text-slate-800 text-center mb-6">Explore Our Services</h2>
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <a href="https://www.yoursdurham.com/develop" target="_blank" rel="noopener noreferrer">
              <Card className="bg-white shadow-md border-0 hover:shadow-xl transition-shadow cursor-pointer h-full">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-4">
                    <Package className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Film Developing</h3>
                  <p className="text-slate-600">Professional film developing services for all your analog photography needs</p>
                </CardContent>
              </Card>
            </a>
            <a href="https://www.yoursdurham.com/shop-now" target="_blank" rel="noopener noreferrer">
              <Card className="bg-white shadow-md border-0 hover:shadow-xl transition-shadow cursor-pointer h-full">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-4">
                    <Film className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Shop Film</h3>
                  <p className="text-slate-600">Browse our selection of premium film stock and photography supplies</p>
                </CardContent>
              </Card>
            </a>
          </div>
        </div>

        <div className="text-center mt-8 text-sm text-slate-600">
          Please reach out to{" "}
          <a href={`mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@yoursdurham.com"}`} className="text-amber-600 hover:text-amber-700 font-medium">
            {process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@yoursdurham.com"}
          </a>{" "}
          if you have any questions regarding the status of your order.
        </div>
      </main>
    </div>
  );
}
