"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Film, Search, Loader2, Calendar, Layers, Package, CheckCircle, Clock, Download, ExternalLink, Printer, Mail } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
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
    <div className="min-h-screen bg-[#F7F3EC]">
      <header className="bg-[#F7F3EC]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-10 text-center">
          <a href="/">
            <img src="/logo.png" alt="Yours Durham" className="w-12 h-12 mx-auto mb-4 rounded-xl" />
          </a>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            Track My Film
            <span className="text-slate-500 font-normal ml-2">– A Project by Yours, Durham</span>
          </h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <Card className="bg-[#FFFDF9] border border-[#E8DED2] shadow-sm rounded-[24px] mb-8">
          <CardContent className="p-6">
            <div className="relative w-full mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input

  placeholder="Enter order number or email..."

  value={searchTerm}

  onChange={(e) => setSearchTerm(e.target.value)}

  onKeyDown={(e) => {

    if (e.key === "Enter" && searchTerm) {

      handleSearch(searchTerm.includes("@") ? "email" : "order");

    }

  }}

  className="pl-11 h-12 text-sm sm:text-base"

/>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={() => handleSearch("order")} disabled={!searchTerm || isLoading}
                 variant="outline"  className="flex-1 justify-start sm:justify-center items-center gap-3 px-4 py-4 text-left sm:text-center bg-[#24324A] text-white hover:bg-[#1D293D] border-0 rounded-xl">
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                Track by Order #
              </Button>
              <Button onClick={() => handleSearch("email")} disabled={!searchTerm || isLoading}
                variant="outline"  className="flex-1 justify-start sm:justify-center items-center gap-3 px-4 py-4 text-left sm:text-center bg-[#24324A] text-white hover:bg-[#1D293D] border-0 rounded-xl">
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                Track by Email
              </Button>
            </div>
          </CardContent>
        </Card>

        <AnimatePresence mode="wait">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-[#C9A34B] animate-spin" />
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

                    {/* Film details */}
                    {order.roll_details && order.roll_details.length > 0 ? (
                      <div className="pt-4 border-t border-slate-100 mt-4 space-y-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Film Details</p>
                        {order.roll_details.map((roll, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-medium text-slate-600 min-w-[44px]">Roll {i + 1}</span>
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">{roll.film_type}</span>
                            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">{roll.film_process}</span>
                            {roll.film_stock && (
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">{roll.film_stock}</span>
                            )}
                            {roll.prints_4x6 && (
                              <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium flex items-center gap-1">
                                <Printer className="w-3 h-3" /> 4x6 Prints
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (order.film_type || order.film_process) ? (
                      <div className="pt-4 border-t border-slate-100 mt-4 space-y-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Film Details</p>
                        <div className="flex flex-wrap gap-2">
                          {order.film_type && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">{order.film_type}</span>}
                          {order.film_process && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">{order.film_process}</span>}
                          {order.film_stock && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">{order.film_stock}</span>}
                          {order.prints_4x6 && (
                            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium flex items-center gap-1">
                              <Printer className="w-3 h-3" /> 4x6 Prints
                            </span>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {/* Admin notes */}
                    {order.notes && (
                      <div className="pt-4 border-t border-slate-100 mt-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Order Notes</p>
                        <p className="text-sm text-slate-600 italic">{order.notes}</p>
                      </div>
                    )}

                    {/* Download scans */}
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
          <div className="grid md:grid-cols-3 gap-6">
            <a href="https://www.yoursdurham.com/develop" target="_blank" rel="noopener noreferrer">
              <Card className="bg-white shadow-md border-0 hover:shadow-xl transition-shadow cursor-pointer h-full">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-lg bg-[#F5EBDC] flex items-center justify-center mb-4">
                    <Package className="w-6 h-6 text-[#24324A]" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Film Developing</h3>
                  <p className="text-slate-600">Professional film developing services for all your analog photography needs</p>
                </CardContent>
              </Card>
            </a>
            <a href="https://www.yoursdurham.com/shop-now" target="_blank" rel="noopener noreferrer">
              <Card className="bg-white shadow-md border-0 hover:shadow-xl transition-shadow cursor-pointer h-full">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-lg bg-[#8FAF9A] flex items-center justify-center mb-4">
                    <Film className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Shop Film</h3>
                  <p className="text-slate-600">Browse our selection of premium film stock and photography supplies</p>
                </CardContent>
              </Card>
            </a>
            <a href="mailto:hello@yoursdurham.com">
              <Card className="bg-white shadow-md border-0 hover:shadow-xl transition-shadow cursor-pointer h-full">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-lg bg-[#c5aed7] flex items-center justify-center mb-4">
                    <Mail className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Need help?</h3>
                  <p className="text-slate-600">Click here to send us an email!</p>
                </CardContent>
              </Card>
            </a>
          </div>
        </div>

        <div className="text-left sm:text-center mt-8 text-sm text-slate-600 flex flex-col gap-1 px-1 sm:px-0 leading-tight">

  

  <a

    href="http://maps.apple.com/?q=209+N+Gregson+St+Durham+NC+27701"

    className="text-[#24324A] underline underline-offset-2 hover:no-underline"

  >

    209 N. Gregson St. Durham, NC 27701

  </a>
  <span>Retail Hours: Thursdays 5–7PM & Saturdays 11–2PM</span>
  <span>Film Drop Box - 24/7</span>
</div>
      </main>
    </div>
  );
}
