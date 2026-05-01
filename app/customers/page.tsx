"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Search, ArrowLeft, Loader2, Trash2, ChevronUp, ChevronDown,
  ChevronsUpDown, UserPlus, ChevronLeft, ChevronRight, ExternalLink, Layers, Calendar, RefreshCw, MailWarning, Pencil,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import Link from "next/link";
import AddCustomerForm from "@/components/AddCustomerForm";
import type { Customer, FilmOrder, FilmProcess, FilmType, OrderStatus, RollDetail } from "@/lib/types";
import { STATUS_FLOW, STATUS_TEMPLATE_MAP } from "@/lib/constants";

type SortKey = "email" | "name" | "last_name" | "last_dropoff_date" | "total_rolls" | "total_dropoffs";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;
const FILM_TYPES: FilmType[] = ["35mm", "120"];
const FILM_PROCESSES: FilmProcess[] = ["Color", "Black & White", "Both"];
type ScanSize = NonNullable<RollDetail["scan_size"]>;
const SCAN_SIZES = ["Standard", "High-Res", "TIFF", "Process Only"] as const satisfies readonly ScanSize[];

const isScanSize = (value: string): value is ScanSize =>
  SCAN_SIZES.includes(value as ScanSize);

type OrderDraft = {
  order_number: string;
  status: OrderStatus;
  dropoff_date: string;
  roll_count: number;
  wetransfer_link: string;
  notes: string;
  roll_details: RollDetail[];
};

export default function Customers() {
  const [search, setSearch]       = useState("");
  const [sortKey, setSortKey]     = useState<SortKey>("last_dropoff_date");
  const [sortDir, setSortDir]     = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Customer>>({});
  const [showAdd, setShowAdd]     = useState(false);
  const [page, setPage]           = useState(1);
  const [pendingCustomer, setPendingCustomer] = useState<Customer | "close" | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<FilmOrder | null>(null);
  const [orderDraft, setOrderDraft] = useState<OrderDraft | null>(null);
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["customers"],
    queryFn: async () => {
      const r = await fetch("/api/customers");
      if (!r.ok) throw new Error("Failed to fetch customers");
      return r.json();
    },
    refetchInterval: 120000,
  });

  const { data: orders = [] } = useQuery<FilmOrder[]>({
    queryKey: ["filmOrders"],
    queryFn: async () => {
      const r = await fetch("/api/orders");
      if (!r.ok) throw new Error("Failed to fetch orders");
      return r.json();
    },
    refetchInterval: 120000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/customers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer deleted");
      setExpandedId(null);
    },
  });

  const retryEmailMutation = useMutation({
    mutationFn: async ({ orderId, template }: { orderId: string; template: string }) => {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, template }),
      });
      const data = await res.json() as { error?: string; skipped?: boolean };
      if (!res.ok) throw new Error(data.error ?? "Failed to send email");
      if (data.skipped) throw new Error("Email was skipped (already sent recently)");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["filmOrders"] });
      toast.success("Email sent successfully");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveOrderMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<FilmOrder> }) => {
      const r = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to save order");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["filmOrders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Order saved");
      setSelectedOrder(null);
      setOrderDraft(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const data = await r.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to delete order");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["filmOrders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Order deleted");
      setSelectedOrder(null);
      setOrderDraft(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Customer> }) => {
      const r = await fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error("Failed to save");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Saved");
    },
    onError: () => toast.error("Failed to save"),
  });

  const isDirty = (draft: Partial<Customer>, original: Customer) =>
    draft.name              !== original.name ||
    (draft.last_name        ?? "") !== (original.last_name        ?? "") ||
    (draft.email            ?? "") !== (original.email            ?? "") ||
    (draft.notes            ?? "") !== (original.notes            ?? "") ||
    (draft.last_dropoff_date ?? "") !== (original.last_dropoff_date ?? "") ||
    (draft.last_order_number ?? "") !== (original.last_order_number ?? "") ||
    (draft.current_rolls    ?? 0)  !== (original.current_rolls    ?? 0)  ||
    (draft.total_rolls      ?? 0)  !== (original.total_rolls      ?? 0)  ||
    (draft.total_dropoffs   ?? 0)  !== (original.total_dropoffs   ?? 0);

  const buildPatch = (): Partial<Customer> => ({
    name:              editDraft.name,
    last_name:         editDraft.last_name  || undefined,
    email:             editDraft.email      || undefined,
    notes:             editDraft.notes      || undefined,
    last_dropoff_date: editDraft.last_dropoff_date || undefined,
    last_order_number: editDraft.last_order_number || undefined,
    current_rolls:     editDraft.current_rolls,
    total_rolls:       editDraft.total_rolls  ?? 0,
    total_dropoffs:    editDraft.total_dropoffs ?? 0,
  });

  const doExpand = (customer: Customer) => {
    setExpandedId(customer.id);
    setEditDraft({
      name:              customer.name,
      last_name:         customer.last_name         ?? "",
      email:             customer.email             ?? "",
      last_dropoff_date: customer.last_dropoff_date ?? "",
      last_order_number: customer.last_order_number ?? "",
      current_rolls:     customer.current_rolls     ?? 0,
      total_rolls:       customer.total_rolls       ?? 0,
      total_dropoffs:    customer.total_dropoffs    ?? 0,
      notes:             customer.notes             ?? "",
    });
  };

  const openExpand = (customer: Customer) => {
    const currentCustomer = customers.find((c) => c.id === expandedId);
    const dirty = currentCustomer && isDirty(editDraft, currentCustomer);

    if (expandedId === customer.id) {
      // Clicking the same row → collapse; prompt if dirty
      if (dirty) { setPendingCustomer("close"); setShowUnsavedDialog(true); return; }
      setExpandedId(null);
      return;
    }

    // Switching to a different row while one is open
    if (dirty) { setPendingCustomer(customer); setShowUnsavedDialog(true); return; }

    doExpand(customer);
  };

  const handleSaveAndContinue = async () => {
    if (!expandedId) return;
    try {
      await saveMutation.mutateAsync({ id: expandedId, patch: buildPatch() });
    } catch {
      // error already toasted by onError; close dialog and stay
      setShowUnsavedDialog(false);
      setPendingCustomer(null);
      return;
    }
    setShowUnsavedDialog(false);
    if (pendingCustomer === "close") { setExpandedId(null); }
    else if (pendingCustomer)        { doExpand(pendingCustomer); }
    setPendingCustomer(null);
  };

  const handleDiscard = () => {
    setShowUnsavedDialog(false);
    if (pendingCustomer === "close") { setExpandedId(null); }
    else if (pendingCustomer)        { doExpand(pendingCustomer); }
    setPendingCustomer(null);
  };

  const handleCancelNav = () => {
    setShowUnsavedDialog(false);
    setPendingCustomer(null);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  };

  const getOrders = (id: string) => orders.filter((o) => o.customer_id === id);

  const getOrderRollDetails = (order: FilmOrder): RollDetail[] => (
    order.roll_details?.length
      ? order.roll_details
      : [{
          film_type: order.film_type,
          film_process: order.film_process,
          film_stock: order.film_stock,
          prints_4x6: order.prints_4x6,
        }]
  );

  const openOrderEditor = (order: FilmOrder) => {
    setSelectedOrder(order);
    setOrderDraft({
      order_number: order.order_number,
      status: order.status,
      dropoff_date: order.dropoff_date,
      roll_count: order.roll_count,
      wetransfer_link: order.wetransfer_link ?? "",
      notes: order.notes ?? "",
      roll_details: getOrderRollDetails(order),
    });
  };

  const updateRollDraft = <K extends keyof RollDetail>(
    index: number,
    key: K,
    value: RollDetail[K]
  ) => {
    setOrderDraft((draft) => {
      if (!draft) return draft;
      return {
        ...draft,
        roll_details: draft.roll_details.map((roll, rollIndex) =>
          rollIndex === index ? { ...roll, [key]: value } : roll
        ),
      };
    });
  };

  const saveSelectedOrder = () => {
    if (!selectedOrder || !orderDraft) return;
    const firstRoll = orderDraft.roll_details[0];

    saveOrderMutation.mutate({
      id: selectedOrder.id,
      patch: {
        order_number: orderDraft.order_number.trim(),
        status: orderDraft.status,
        dropoff_date: orderDraft.dropoff_date,
        roll_count: Number(orderDraft.roll_count) || 1,
        film_type: firstRoll?.film_type,
        film_process: firstRoll?.film_process,
        film_stock: firstRoll?.film_stock || undefined,
        prints_4x6: Boolean(firstRoll?.prints_4x6),
        roll_details: orderDraft.roll_details,
        wetransfer_link: orderDraft.wetransfer_link.trim() || undefined,
        notes: orderDraft.notes.trim() || undefined,
      },
    });
  };

  const filtered = useMemo(() => customers
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        `${c.name} ${c.last_name ?? ""}`.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.last_order_number?.toLowerCase().includes(q) ||
        orders.some((o) => o.customer_id === c.id && o.order_number.toLowerCase().includes(q))
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
    }), [customers, orders, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderSortIcon = (col: SortKey) =>
    sortKey !== col ? (
      <ChevronsUpDown className="w-3 h-3 ml-1 text-slate-400 inline" />
    ) : sortDir === "asc" ? (
      <ChevronUp className="w-3 h-3 ml-1 text-amber-600 inline" />
    ) : (
      <ChevronDown className="w-3 h-3 ml-1 text-amber-600 inline" />
    );

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
                src="/logo.png"
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
            placeholder="Search by name, email, or order #..."
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
                  <TableHead className={th} onClick={() => handleSort("email")}>Email {renderSortIcon("email")}</TableHead>
                  <TableHead className={th} onClick={() => handleSort("name")}>First Name {renderSortIcon("name")}</TableHead>
                  <TableHead className={th} onClick={() => handleSort("last_name")}>Last Name {renderSortIcon("last_name")}</TableHead>
                  <TableHead className={th} onClick={() => handleSort("last_dropoff_date")}>Date {renderSortIcon("last_dropoff_date")}</TableHead>
                  <TableHead className={th}>Order #</TableHead>
                  <TableHead className={`${th} text-center`}>Current Rolls</TableHead>
                  <TableHead className={`${th} text-center`} onClick={() => handleSort("total_rolls")}>Total Rolls {renderSortIcon("total_rolls")}</TableHead>
                  <TableHead className={`${th} text-center`} onClick={() => handleSort("total_dropoffs")}>Drop-off Count {renderSortIcon("total_dropoffs")}</TableHead>
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
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-white border-stone-200 h-8 text-sm" />
                                    </div>
                                    <div>
                                      <label className="text-xs text-slate-500 mb-1 block">First Name</label>
                                      <Input value={editDraft.name ?? ""}
                                        onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-white border-stone-200 h-8 text-sm" />
                                    </div>
                                    <div>
                                      <label className="text-xs text-slate-500 mb-1 block">Last Name</label>
                                      <Input value={editDraft.last_name ?? ""}
                                        onChange={(e) => setEditDraft((d) => ({ ...d, last_name: e.target.value }))}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-white border-stone-200 h-8 text-sm" />
                                    </div>
                                    <div>
                                      <label className="text-xs text-slate-500 mb-1 block">Date (Last Drop-off)</label>
                                      <Input type="date" value={editDraft.last_dropoff_date ?? ""}
                                        onChange={(e) => setEditDraft((d) => ({ ...d, last_dropoff_date: e.target.value }))}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-white border-stone-200 h-8 text-sm" />
                                    </div>
                                    {/* Row 2: Order #, Current Rolls, Total Rolls, Drop-off Count */}
                                    <div>
                                      <label className="text-xs text-slate-500 mb-1 block">Order #</label>
                                      <Input value={editDraft.last_order_number ?? ""}
                                        onChange={(e) => setEditDraft((d) => ({ ...d, last_order_number: e.target.value }))}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-white border-stone-200 h-8 text-sm font-mono" />
                                    </div>
                                    <div>
                                      <label className="text-xs text-slate-500 mb-1 block">Current Rolls</label>
                                      <Input type="number" value={editDraft.current_rolls ?? ""}
                                        onChange={(e) => setEditDraft((d) => ({ ...d, current_rolls: Number(e.target.value) }))}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-white border-stone-200 h-8 text-sm" />
                                    </div>
                                    <div>
                                      <label className="text-xs text-slate-500 mb-1 block">Total Rolls</label>
                                      <Input type="number" value={editDraft.total_rolls ?? 0}
                                        onChange={(e) => setEditDraft((d) => ({ ...d, total_rolls: Number(e.target.value) }))}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-white border-stone-200 h-8 text-sm" />
                                    </div>
                                    <div>
                                      <label className="text-xs text-slate-500 mb-1 block">Drop-off Count</label>
                                      <Input type="number" value={editDraft.total_dropoffs ?? 0}
                                        onChange={(e) => setEditDraft((d) => ({ ...d, total_dropoffs: Number(e.target.value) }))}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-white border-stone-200 h-8 text-sm" />
                                    </div>
                                  </div>
                                  <div className="mt-2">
                                    <label className="text-xs text-slate-500 mb-1 block">Notes</label>
                                    <Input value={editDraft.notes ?? ""} placeholder="Internal notes..."
                                      onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
                                      onClick={(e) => e.stopPropagation()}
                                      className="bg-white border-stone-200 h-8 text-sm" />
                                  </div>
                                  <div className="mt-3 flex justify-end" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                      size="sm"
                                      disabled={saveMutation.isPending}
                                      onClick={() => saveMutation.mutate({ id: customer.id, patch: buildPatch() })}
                                      className="bg-amber-600 hover:bg-amber-700 text-white h-8 px-4 text-xs"
                                    >
                                      {saveMutation.isPending ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Saving...</> : "Save Changes"}
                                    </Button>
                                  </div>
                                </div>

                                {/* Order history */}
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Order History</p>
                                  {allOrders.length === 0 ? (
                                    <p className="text-sm text-slate-400 italic">No orders on record yet.</p>
                                  ) : (
                                    <div className="space-y-2">
                                      {allOrders.map((order) => (
                                        <div key={order.id} className="flex flex-wrap items-center gap-3 bg-white rounded-lg px-4 py-2.5 border border-stone-100 text-sm">
                                          <span className="font-mono font-medium text-slate-700">#{order.order_number}</span>
                                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                                            order.status === "Received by Yours" ? "bg-[var(--accent-tan)] text-[#A77B43]" :
                                            order.status === "Received at Lab"   ? "bg-[var(--accent-green)] text-white" :
                                            "bg-[var(--accent-purple)] text-white"}`}>{order.status}</span>
                                          <span className="flex items-center gap-1 text-slate-500">
                                            <Layers className="w-3.5 h-3.5" /> {order.roll_count} roll{order.roll_count !== 1 ? "s" : ""}
                                          </span>
                                          <span className="flex items-center gap-1 text-slate-400 text-xs">
                                            <Calendar className="w-3 h-3" />
                                            {format(new Date(order.dropoff_date), "MMM d, yyyy")}
                                          </span>
                                          <div className="ml-auto flex items-center gap-2">
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              className="h-7 border-stone-200 px-2 text-xs text-slate-600 hover:border-[var(--accent-purple)]/40 hover:bg-[var(--accent-purple)]/10 hover:text-[#806A91]"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                openOrderEditor(order);
                                              }}
                                            >
                                              <Pencil className="w-3 h-3 mr-1" />
                                              Edit
                                            </Button>
                                            {order.email_status === "failed" && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const t = STATUS_TEMPLATE_MAP[order.status] ?? "film_drop_received";
                                                  retryEmailMutation.mutate({ orderId: order.id, template: t });
                                                }}
                                                disabled={retryEmailMutation.isPending}
                                                title={order.email_error ?? "Email failed — click to retry"}
                                                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 bg-red-50 hover:bg-red-100 rounded px-2 py-0.5 transition-colors disabled:opacity-50"
                                              >
                                                {retryEmailMutation.isPending
                                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                                  : <><MailWarning className="w-3 h-3" /> <RefreshCw className="w-3 h-3" /></>}
                                                Retry email
                                              </button>
                                            )}
                                            {order.wetransfer_link && (
                                              <a href={order.wetransfer_link} target="_blank" rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium">
                                                <ExternalLink className="w-3.5 h-3.5" /> Scans
                                              </a>
                                            )}
                                            <AlertDialog>
                                              <AlertDialogTrigger
                                                render={
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 border-red-200 px-2 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                                                    onClick={(e) => e.stopPropagation()}
                                                  />
                                                }
                                              >
                                                <Trash2 className="w-3 h-3" />
                                              </AlertDialogTrigger>
                                              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                                <AlertDialogHeader>
                                                  <AlertDialogTitle>Delete order #{order.order_number}?</AlertDialogTitle>
                                                  <AlertDialogDescription>
                                                    This permanently deletes this order for {customer.name}.
                                                  </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                  <AlertDialogAction
                                                    onClick={() => deleteOrderMutation.mutate(order.id)}
                                                    className="bg-red-600 hover:bg-red-700"
                                                  >
                                                    Delete order
                                                  </AlertDialogAction>
                                                </AlertDialogFooter>
                                              </AlertDialogContent>
                                            </AlertDialog>
                                          </div>
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
                                          This permanently deletes this customer. Their drop-off history will remain but will not be linked to anyone.
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

      {/* Order edit dialog */}
      <Dialog
        open={Boolean(selectedOrder && orderDraft)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOrder(null);
            setOrderDraft(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Edit Order {selectedOrder ? `#${selectedOrder.order_number}` : ""}
            </DialogTitle>
            <DialogDescription>
              Update the order details attached to this customer.
            </DialogDescription>
          </DialogHeader>

          {orderDraft ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Order #</label>
                  <Input
                    value={orderDraft.order_number}
                    onChange={(e) => setOrderDraft((draft) => draft ? { ...draft, order_number: e.target.value } : draft)}
                    className="border-stone-200"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
                  <select
                    value={orderDraft.status}
                    onChange={(e) => setOrderDraft((draft) => draft ? { ...draft, status: e.target.value as OrderStatus } : draft)}
                    className="h-8 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-[var(--accent-purple)] focus:ring-2 focus:ring-[var(--accent-purple)]/20"
                  >
                    {STATUS_FLOW.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Drop-off Date</label>
                  <Input
                    type="date"
                    value={orderDraft.dropoff_date}
                    onChange={(e) => setOrderDraft((draft) => draft ? { ...draft, dropoff_date: e.target.value } : draft)}
                    className="border-stone-200"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Roll Count</label>
                  <Input
                    type="number"
                    min={1}
                    value={orderDraft.roll_count}
                    onChange={(e) => setOrderDraft((draft) => draft ? { ...draft, roll_count: Number(e.target.value) } : draft)}
                    className="border-stone-200"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Film Details</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 border-stone-200 text-xs"
                    onClick={() => setOrderDraft((draft) => draft ? {
                      ...draft,
                      roll_count: draft.roll_details.length + 1,
                      roll_details: [
                        ...draft.roll_details,
                        { film_type: "35mm", film_process: "Color", film_stock: "", prints_4x6: false },
                      ],
                    } : draft)}
                  >
                    Add roll
                  </Button>
                </div>
                <div className="space-y-3">
                  {orderDraft.roll_details.map((roll, index) => (
                    <div key={`${selectedOrder?.id}-edit-roll-${index}`} className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-800">Roll {index + 1}</p>
                        {orderDraft.roll_details.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setOrderDraft((draft) => draft ? {
                              ...draft,
                              roll_count: Math.max(1, draft.roll_details.length - 1),
                              roll_details: draft.roll_details.filter((_, rollIndex) => rollIndex !== index),
                            } : draft)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs text-slate-500">Film Type</label>
                          <select
                            value={roll.film_type}
                            onChange={(e) => updateRollDraft(index, "film_type", e.target.value as FilmType)}
                            className="h-8 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-[var(--accent-purple)] focus:ring-2 focus:ring-[var(--accent-purple)]/20"
                          >
                            {FILM_TYPES.map((type) => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-slate-500">Process</label>
                          <select
                            value={roll.film_process}
                            onChange={(e) => updateRollDraft(index, "film_process", e.target.value as FilmProcess)}
                            className="h-8 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-[var(--accent-purple)] focus:ring-2 focus:ring-[var(--accent-purple)]/20"
                          >
                            {FILM_PROCESSES.map((process) => (
                              <option key={process} value={process}>{process}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-slate-500">Film Stock</label>
                          <Input
                            value={roll.film_stock ?? ""}
                            onChange={(e) => updateRollDraft(index, "film_stock", e.target.value)}
                            placeholder="Cinestill 800T"
                            className="border-stone-200"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-slate-500">Scan Size</label>
                          <select
                            value={roll.scan_size ?? ""}
                            onChange={(e) =>
  updateRollDraft(
    index,
    "scan_size",
    (e.target.value || undefined) as
      | "Standard"
      | "High-Res"
      | "TIFF"
      | "Process Only"
      | undefined
  )
}
                            className="h-8 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-[var(--accent-purple)] focus:ring-2 focus:ring-[var(--accent-purple)]/20"
                          >
                            <option value="">None</option>
                            {SCAN_SIZES.map((size) => (
                              <option key={size} value={size}>{size}</option>
                            ))}
                          </select>
                        </div>
                        <label className="flex items-end gap-2 pb-1 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            checked={Boolean(roll.prints_4x6)}
                            onChange={(e) => updateRollDraft(index, "prints_4x6", e.target.checked)}
                            className="mb-1 h-4 w-4 rounded border-stone-300"
                          />
                          4x6 Prints
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Download Link</label>
                <Input
                  value={orderDraft.wetransfer_link}
                  onChange={(e) => setOrderDraft((draft) => draft ? { ...draft, wetransfer_link: e.target.value } : draft)}
                  placeholder="https://we.tl/..."
                  className="border-stone-200"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Order Notes</label>
                <Textarea
                  value={orderDraft.notes}
                  onChange={(e) => setOrderDraft((draft) => draft ? { ...draft, notes: e.target.value } : draft)}
                  placeholder="Internal notes..."
                  className="min-h-24 border-stone-200"
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelectedOrder(null);
                setOrderDraft(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saveOrderMutation.isPending}
              className="bg-[var(--accent-purple)] text-white hover:bg-[#9D85AD]"
              onClick={saveSelectedOrder}
            >
              {saveOrderMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Order"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsaved changes dialog */}
      <Dialog open={showUnsavedDialog} onOpenChange={(open) => { if (!open) handleCancelNav(); }}>
        <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes to this customer. What would you like to do?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="ghost" onClick={handleCancelNav} className="order-3 sm:order-1 text-slate-500">
              Keep editing
            </Button>
            <Button variant="outline" onClick={handleDiscard} className="order-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">
              Discard
            </Button>
            <Button onClick={handleSaveAndContinue} disabled={saveMutation.isPending}
              className="order-1 sm:order-3 bg-amber-600 hover:bg-amber-700 text-white">
              {saveMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save & continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
