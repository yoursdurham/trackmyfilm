"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Search, Film, Users, ArrowLeft, Layers, Hash, Loader2, Trash2,
  Calendar, ChevronDown, ChevronUp, Sparkles, ExternalLink, UserPlus, Upload,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import AddCustomerForm from "@/components/AddCustomerForm";
import type { Customer, FilmOrder } from "@/lib/types";

export default function Customers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCustomers, setExpandedCustomers] = useState(new Set<string>());
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [importing, setImporting] = useState(false);

  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["customers"],
    queryFn: () => fetch("/api/customers").then((r) => r.json()),
  });

  const { data: orders = [] } = useQuery<FilmOrder[]>({
    queryKey: ["filmOrders"],
    queryFn: () => fetch("/api/orders").then((r) => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/customers/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(customers.map((c) => fetch(`/api/customers/${c.id}`, { method: "DELETE" })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("All customers deleted");
    },
  });

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await fetch("/api/customers/import", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(`Imported ${data.imported} customers (${data.skipped} skipped)`);
        queryClient.invalidateQueries({ queryKey: ["customers"] });
      } else {
        toast.error(data.error || "Import failed");
      }
    } catch {
      toast.error("Failed to import customers");
    } finally {
      setImporting(false);
    }
  };

  const filteredCustomers = customers.filter((c) =>
    !searchQuery || `${c.name} ${c.last_name ?? ""}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCustomerOrders = (customerId: string) =>
    orders.filter((o) => o.customer_id === customerId);

  const toggleCustomer = (id: string) =>
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-orange-50/30 to-amber-50/20">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-stone-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon" className="mr-2">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6978dcf349e3b02b595cdfac/635085959_YoursSingleNegativeLetterLogocolorcreambackground.png"
                alt="Yours Durham"
                className="w-9 h-9 rounded-xl object-cover"
              />
              <div>
                <h1 className="text-lg font-semibold text-slate-800">Customers</h1>
                <p className="text-xs text-slate-500 hidden sm:block">{customers.length} total</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowAddCustomer(true)} className="bg-amber-600 hover:bg-amber-700 text-white">
                <UserPlus className="w-4 h-4 mr-2" /> Add Customer
              </Button>
              <Button onClick={handleImport} disabled={importing} variant="outline"
                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Import from Sheet
              </Button>
              <AlertDialog>
                <AlertDialogTrigger
                  render={<Button variant="outline" disabled={customers.length === 0} className="border-red-200 text-red-700 hover:bg-red-50" />}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete All
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete all customers?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {customers.length} customers. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteAllMutation.mutate()} className="bg-red-600 hover:bg-red-700">
                      Delete All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="relative max-w-sm mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search customers..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white border-stone-200" />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-stone-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-700 mb-1">No customers found</h3>
            <p className="text-slate-500">
              {searchQuery ? "Try a different search" : "Customers will appear here after drop-offs"}
            </p>
          </div>
        ) : (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredCustomers.map((customer) => {
                const customerOrders = getCustomerOrders(customer.id);
                const isExpanded = expandedCustomers.has(customer.id);
                return (
                  <motion.div key={customer.id} layout
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}>
                    <Card className="bg-white border-0 shadow-sm hover:shadow-md transition-all">
                      <CardContent className="p-5">
                        <h3 className="font-semibold text-slate-800 text-lg mb-3">
                          {customer.name} {customer.last_name}
                        </h3>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-rose-50 rounded-lg p-3 text-center">
                            <Hash className="w-4 h-4 text-rose-600 mx-auto mb-1" />
                            <p className="text-2xl font-bold text-rose-700">{customer.total_dropoffs || 0}</p>
                            <p className="text-xs text-rose-600">Drop-offs</p>
                          </div>
                          <div className="bg-green-50 rounded-lg p-3 text-center">
                            <Layers className="w-4 h-4 text-green-600 mx-auto mb-1" />
                            <p className="text-2xl font-bold text-green-700">{customer.total_rolls || 0}</p>
                            <p className="text-xs text-green-600">Total Rolls</p>
                          </div>
                          <div className="bg-purple-50 rounded-lg p-3 text-center">
                            <Sparkles className="w-4 h-4 text-purple-600 mx-auto mb-1" />
                            <p className="text-2xl font-bold text-purple-700">{customer.points || 0}</p>
                            <p className="text-xs text-purple-600">Points</p>
                          </div>
                        </div>

                        {customer.notes && (
                          <p className="text-sm text-slate-500 mt-3 p-2 bg-slate-50 rounded">{customer.notes}</p>
                        )}

                        {customerOrders.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-slate-100">
                            <Button variant="ghost" size="sm" onClick={() => toggleCustomer(customer.id)}
                              className="w-full justify-between text-slate-700 hover:bg-slate-50">
                              <span className="flex items-center gap-2">
                                <Film className="w-4 h-4" /> View Order History ({customerOrders.length})
                              </span>
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </Button>
                            {isExpanded && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                                className="mt-3 space-y-2">
                                {customerOrders.map((order) => (
                                  <div key={order.id} className="bg-slate-50 rounded-lg p-3 text-sm">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="font-medium text-slate-800">#{order.order_number}</span>
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                                        order.status === "Received by Yours" ? "bg-blue-100 text-blue-700" :
                                        order.status === "Received at Lab"   ? "bg-amber-100 text-amber-700" :
                                        "bg-emerald-100 text-emerald-700"
                                      }`}>{order.status}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-slate-600 mb-2">
                                      <div className="flex items-center gap-2">
                                        <Layers className="w-3.5 h-3.5" />
                                        <span>{order.roll_count} roll{order.roll_count > 1 ? "s" : ""}</span>
                                      </div>
                                      <div className="flex items-center gap-1 text-xs text-slate-500">
                                        <Calendar className="w-3 h-3" />
                                        {format(new Date(order.dropoff_date), "MMM d, yyyy")}
                                      </div>
                                    </div>
                                    {order.wetransfer_link && (
                                      <a href={order.wetransfer_link} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium mt-2">
                                        <ExternalLink className="w-3 h-3" /> WeTransfer Link
                                      </a>
                                    )}
                                  </div>
                                ))}
                              </motion.div>
                            )}
                          </div>
                        )}

                        <div className="mt-4 pt-3 border-t border-slate-100">
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={<Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50 w-full" />}
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Delete Customer
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {customer.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete this customer. Their drop-off history will remain but won&apos;t be linked to this customer.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMutation.mutate(customer.id)} className="bg-red-600 hover:bg-red-700">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      <AddCustomerForm open={showAddCustomer} onOpenChange={setShowAddCustomer}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["customers"] })} />
    </div>
  );
}
