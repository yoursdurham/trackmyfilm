"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Search, ArrowLeft, Loader2, Trash2, ChevronUp, ChevronDown,
  ChevronsUpDown, UserPlus, ChevronLeft, ChevronRight, ExternalLink, Layers, Calendar,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import Link from "next/link";
import AddCustomerForm from "@/components/AddCustomerForm";
import type { Customer, FilmOrder } from "@/lib/types";

type SortKey = "email" | "name" | "last_name" | "last_dropoff_date" | "total_rolls" | "total_dropoffs";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;

export default function Customers() {
  const [search, setSearch]       = useState("");
  const [sortKey, setSortKey]     = useState<SortKey>("last_dropoff_date");
  const [sortDir, setSortDir]     = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Customer>>({});
  const [showAdd, setShowAdd]     = useState(false);
  const [page, setPage]           = useState(1);
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["customers"],
    queryFn: () => fetch("/api/customers").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const { data: orders = [] } = useQuery<FilmOrder[]>({
    queryKey: ["filmOrders"],
    queryFn: () => fetch("/api/orders").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/customers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer deleted");
      setExpandedId(null);
    },
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Customer> }) =>
      fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Saved");
    },
    onError: () => toast.error("Failed to save"),
  });

  const openExpand = (customer: Customer) => {
    if (expandedId === customer.id) { setExpandedId(null); return; }
    setExpandedId(customer.id);
    setEditDraft({
      name:      customer.name,
      last_name: customer.last_name ?? "",
      email:             customer.email ?? "",
      last_dropoff_date: customer.last_dropoff_date ?? "",
      last_order_number: customer.last_order_number ?? "",
      current_rolls:     customer.current_rolls ?? 0,
      total_rolls:       customer.total_rolls ?? 0,
      total_dropoffs:    customer.total_dropoffs ?? 0,
      notes:             customer.notes ?? "",
    });
  };

  const saveField = (customerId: string, field: keyof Customer, value: unknown) =>
    saveMutation.mutate({ id: customerId, patch: { [field]: value } });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  };

  // Most-recent order per customer
  const latestOrder = (customerId: string): FilmOrder | undefined =>
    orders
      .filter((o) => o.customer_id === customerId)
      .sort((a, b) => new Date(b.dropoff_date).getTime() - new Date(a.dropoff_date).getTime())[0];

  const getOrders = (id: string) => orders.filter((o) => o.customer_id === id);

  const filtered = customers
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        `${c.name} ${c.last_name ?? ""}`.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortKey === "name")               { av = a.name.toLowerCase();              bv = b.name.toLowerCase(); }
      else if (sortKey === "last_name")     { av = (a.last_name ?? "").toLowerCase(); bv = (b.last_name ?? "").toLowerCase(); }
      else if (sortKey === "email")         { av = (a.email ?? "").toLowerCase();     bv = (b.email ?? "").toLowerCase(); }
      else if (sortKey === "last_dropoff_date") { av = a.last_dropoff_date ?? "";     bv = b.last_dropoff_date ?? ""; }
      else                                  { av = (a[sortKey] as number) ?? 0;       bv = (b[sortKey] as number) ?? 0; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey !== col
      ? <ChevronsUpDown className="w-3 h-3 ml-1 text-slate-400 inline" />
      : sortDir === "asc"
        ? <ChevronUp className="w-3 h-3 ml-1 text-amber-600 inline" />
        : <ChevronDown className="w-3 h-3 ml-1 text-amber-600 inline" />;

  const th = "cursor-pointer select-none hover:text-amber-700 whitespace-nowrap text-xs font-semibold uppercase tracking-wide";

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-orange-50/30 to-amber-50/20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-stone-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon" className="mr-1"><ArrowLeft className="w-5 h-5" /></Button>
              </Link>
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6978dcf349e3b02b595cdfac/635085959_YoursSingleNegativeLetterLogocolorcreambackground.png"
                alt="Yours Durham" className="w-9 h-9 rounded-xl object-cover"
              />
              <div>
                <h1 className="text-lg font-semibold text-slate-800">Customers</h1>
                <p className="text-xs text-slate-500">{customers.length} total</p>
              </div>
            </div>
            <Button onClick={() => setShowAdd(true)} className="bg-amber-600 hover:bg-amber-700 text-white">
              <UserPlus className="w-4 h-4 mr-2" /> Add Customer
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Search */}
        <div className="relative max-w-sm mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10 bg-white border-stone-200"
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50 border-b border-stone-200">
                  <TableHead className={th} onClick={() => handleSort("email")}>Email <SortIcon col="email" /></TableHead>
                  <TableHead className={th} onClick={() => handleSort("name")}>First Name <SortIcon col="name" /></TableHead>
                  <TableHead className={th} onClick={() => handleSort("last_name")}>Last Name <SortIcon col="last_name" /></TableHead>
                  <TableHead className={th} onClick={() => handleSort("last_dropoff_date")}>Date <SortIcon col="last_dropoff_date" /></TableHead>
                  <TableHead className={th}>Order #</TableHead>
                  <TableHead className={`${th} text-center`}>Current Rolls</TableHead>
                  <TableHead className={`${th} text-center`} onClick={() => handleSort("total_rolls")}>Total Rolls <SortIcon col="total_rolls" /></TableHead>
                  <TableHead className={`${th} text-center`} onClick={() => handleSort("total_dropoffs")}>Drop-off Count <SortIcon col="total_dropoffs" /></TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-16 text-slate-400">No customers found</TableCell>
                  </TableRow>
                ) : (
                  paginated.map((customer) => {
                    const isExpanded = expandedId === customer.id;
                    const allOrders  = getOrders(customer.id);
                    // Order # and Current Rolls: prefer customer record (from CSV), fall back to most recent order
                    const recentOrder = allOrders.sort((a, b) => new Date(b.dropoff_date).getTime() - new Date(a.dropoff_date).getTime())[0];
                    const orderNum    = customer.last_order_number || recentOrder?.order_number;
                    const currRolls   = customer.current_rolls ?? recentOrder?.roll_count;

                    return (
                      <React.Fragment key={customer.id}>
                        <TableRow
                          className={`cursor-pointer hover:bg-amber-50/40 transition-colors text-sm ${isExpanded ? "bg-amber-50/60" : ""}`}
                          onClick={() => openExpand(customer)}
                        >
                          <TableCell className="text-slate-500 max-w-[180px] truncate">
                            {customer.email || <span className="text-slate-300 italic">—</span>}
                          </TableCell>
                          <TableCell className="font-medium text-slate-800">{customer.name}</TableCell>
                          <TableCell className="text-slate-600">{customer.last_name || <span className="text-slate-300">—</span>}</TableCell>
                          <TableCell className="text-slate-500 whitespace-nowrap">
                            {customer.last_dropoff_date
                              ? format(new Date(customer.last_dropoff_date), "M/d/yyyy")
                              : <span className="text-slate-300">—</span>}
                          </TableCell>
                          <TableCell className="font-mono text-slate-600">
                            {orderNum || <span className="text-slate-300">—</span>}
                          </TableCell>
                          <TableCell className="text-center text-slate-600">
                            {currRolls ?? <span className="text-slate-300">—</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-700 font-semibold text-sm">
                              {customer.total_rolls || 0}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-rose-100 text-rose-700 font-semibold text-sm">
                              {customer.total_dropoffs || 0}
                            </span>
                          </TableCell>
                          <TableCell>
                            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform mx-auto ${isExpanded ? "rotate-180" : ""}`} />
                          </TableCell>
                        </TableRow>

                        {/* Expanded: edit + order history */}
                        {isExpanded && (
                          <TableRow key={`${customer.id}-exp`} className="bg-amber-50/40">
                            <TableCell colSpan={9} className="py-5 px-6">
                              <div className="flex flex-col gap-5">
                                {/* Edit fields */}
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Edit Customer</p>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {/* Row 1: Email, First Name, Last Name, Date */}
                                    <div>
                                      <label className="text-xs text-slate-500 mb-1 block">Email</label>
                                      <Input type="email" value={editDraft.email ?? ""}
                                        onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
                                        onBlur={() => editDraft.email !== (customer.email ?? "") && saveField(customer.id, "email", editDraft.email || null)}
                                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-white border-stone-200 h-8 text-sm" />
                                    </div>
                                    <div>
                                      <label className="text-xs text-slate-500 mb-1 block">First Name</label>
                                      <Input value={editDraft.name ?? ""}
                                        onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                                        onBlur={() => editDraft.name !== customer.name && saveField(customer.id, "name", editDraft.name)}
                                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-white border-stone-200 h-8 text-sm" />
                                    </div>
                                    <div>
                                      <label className="text-xs text-slate-500 mb-1 block">Last Name</label>
                                      <Input value={editDraft.last_name ?? ""}
                                        onChange={(e) => setEditDraft((d) => ({ ...d, last_name: e.target.value }))}
                                        onBlur={() => editDraft.last_name !== (customer.last_name ?? "") && saveField(customer.id, "last_name", editDraft.last_name || null)}
                                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-white border-stone-200 h-8 text-sm" />
                                    </div>
                                    <div>
                                      <label className="text-xs text-slate-500 mb-1 block">Date (Last Drop-off)</label>
                                      <Input type="date" value={editDraft.last_dropoff_date ?? ""}
                                        onChange={(e) => setEditDraft((d) => ({ ...d, last_dropoff_date: e.target.value }))}
                                        onBlur={() => editDraft.last_dropoff_date !== (customer.last_dropoff_date ?? "") && saveField(customer.id, "last_dropoff_date", editDraft.last_dropoff_date || null)}
                                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-white border-stone-200 h-8 text-sm" />
                                    </div>
                                    {/* Row 2: Order #, Current Rolls, Total Rolls, Drop-off Count */}
                                    <div>
                                      <label className="text-xs text-slate-500 mb-1 block">Order #</label>
                                      <Input value={editDraft.last_order_number ?? ""}
                                        onChange={(e) => setEditDraft((d) => ({ ...d, last_order_number: e.target.value }))}
                                        onBlur={() => editDraft.last_order_number !== (customer.last_order_number ?? "") && saveField(customer.id, "last_order_number", editDraft.last_order_number || null)}
                                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-white border-stone-200 h-8 text-sm font-mono" />
                                    </div>
                                    <div>
                                      <label className="text-xs text-slate-500 mb-1 block">Current Rolls</label>
                                      <Input type="number" value={editDraft.current_rolls ?? ""}
                                        onChange={(e) => setEditDraft((d) => ({ ...d, current_rolls: Number(e.target.value) }))}
                                        onBlur={() => editDraft.current_rolls !== customer.current_rolls && saveField(customer.id, "current_rolls", editDraft.current_rolls || null)}
                                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-white border-stone-200 h-8 text-sm" />
                                    </div>
                                    <div>
                                      <label className="text-xs text-slate-500 mb-1 block">Total Rolls</label>
                                      <Input type="number" value={editDraft.total_rolls ?? 0}
                                        onChange={(e) => setEditDraft((d) => ({ ...d, total_rolls: Number(e.target.value) }))}
                                        onBlur={() => editDraft.total_rolls !== customer.total_rolls && saveField(customer.id, "total_rolls", editDraft.total_rolls)}
                                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-white border-stone-200 h-8 text-sm" />
                                    </div>
                                    <div>
                                      <label className="text-xs text-slate-500 mb-1 block">Drop-off Count</label>
                                      <Input type="number" value={editDraft.total_dropoffs ?? 0}
                                        onChange={(e) => setEditDraft((d) => ({ ...d, total_dropoffs: Number(e.target.value) }))}
                                        onBlur={() => editDraft.total_dropoffs !== customer.total_dropoffs && saveField(customer.id, "total_dropoffs", editDraft.total_dropoffs)}
                                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-white border-stone-200 h-8 text-sm" />
                                    </div>
                                  </div>
                                  <div className="mt-2">
                                    <label className="text-xs text-slate-500 mb-1 block">Notes</label>
                                    <Input value={editDraft.notes ?? ""} placeholder="Internal notes..."
                                      onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
                                      onBlur={() => editDraft.notes !== (customer.notes ?? "") && saveField(customer.id, "notes", editDraft.notes || null)}
                                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                      onClick={(e) => e.stopPropagation()}
                                      className="bg-white border-stone-200 h-8 text-sm" />
                                  </div>
                                  <p className="text-xs text-slate-400 mt-1.5">Press Enter or click away to save</p>
                                </div>

                                {/* Order history */}
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Order History</p>
                                  {allOrders.length === 0 ? (
                                    <p className="text-sm text-slate-400 italic">No orders on record yet.</p>
                                  ) : (
                                    <div className="space-y-2">
                                      {allOrders.map((order) => (
                                        <div key={order.id} className="flex items-center gap-4 bg-white rounded-lg px-4 py-2.5 border border-stone-100 text-sm">
                                          <span className="font-mono font-medium text-slate-700">#{order.order_number}</span>
                                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                                            order.status === "Received by Yours" ? "bg-blue-100 text-blue-700" :
                                            order.status === "Received at Lab"   ? "bg-amber-100 text-amber-700" :
                                            "bg-emerald-100 text-emerald-700"}`}>{order.status}</span>
                                          <span className="flex items-center gap-1 text-slate-500">
                                            <Layers className="w-3.5 h-3.5" /> {order.roll_count} roll{order.roll_count !== 1 ? "s" : ""}
                                          </span>
                                          <span className="flex items-center gap-1 text-slate-400 text-xs">
                                            <Calendar className="w-3 h-3" />
                                            {format(new Date(order.dropoff_date), "MMM d, yyyy")}
                                          </span>
                                          {order.wetransfer_link && (
                                            <a href={order.wetransfer_link} target="_blank" rel="noopener noreferrer"
                                              onClick={(e) => e.stopPropagation()}
                                              className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium ml-auto">
                                              <ExternalLink className="w-3.5 h-3.5" /> Scans
                                            </a>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Delete */}
                                <div className="flex justify-end">
                                  <AlertDialog>
                                    <AlertDialogTrigger
                                      render={<Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()} className="text-red-400 hover:text-red-600 hover:bg-red-50" />}
                                    >
                                      <Trash2 className="w-4 h-4 mr-1.5" /> Delete Customer
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete {customer.name}?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This permanently deletes this customer. Their drop-off history will remain but won't be linked to anyone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => deleteMutation.mutate(customer.id)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-500">
            Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} customers
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(1)} className="hidden sm:flex">First</Button>
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-sm text-slate-600 px-2">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(totalPages)} className="hidden sm:flex">Last</Button>
          </div>
        </div>
      </main>

      <AddCustomerForm open={showAdd} onOpenChange={setShowAdd}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["customers"] })} />
    </div>
  );
}
