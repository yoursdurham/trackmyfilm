"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Search, Loader2, UserPlus, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import InternalHeader from "@/components/InternalHeader";
import AddCustomerForm from "@/components/AddCustomerForm";
import type { CustomerSummary } from "@/lib/types";

const PAGE_SIZE = 50;

function displayName(customer: CustomerSummary) {
  return `${customer.first_name} ${customer.last_name ?? ""}`.trim();
}

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery<CustomerSummary[]>({
    queryKey: ["customers", "stats"],
    queryFn: async () => {
      const response = await fetch("/api/customers?stats=1");
      if (!response.ok) throw new Error("Failed to fetch customers");
      return response.json();
    },
    refetchInterval: 120000,
  });

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) => {
      const name = displayName(customer).toLowerCase();
      return (
        name.includes(query) ||
        customer.email?.toLowerCase().includes(query) ||
        customer.phone?.toLowerCase().includes(query)
      );
    });
  }, [customers, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-orange-50/30 to-amber-50/20">
      <InternalHeader title="Customers" subtitle={`${customers.length} total`} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by name, email, or phone..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="border-stone-200 bg-white pl-10"
            />
          </div>
          <Button onClick={() => setShowAdd(true)} className="bg-amber-600 text-white hover:bg-amber-700">
            <UserPlus className="mr-2 h-4 w-4" />
            Add Customer
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-stone-200 bg-stone-50">
                  <TableHead className="text-xs font-semibold uppercase tracking-wide">Name</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide">Email</TableHead>
                  <TableHead className="text-center text-xs font-semibold uppercase tracking-wide">Orders</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide">Last Order</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide">Common Process</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide">Common Scan</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-16 text-center text-slate-400">
                      No customers found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((customer) => (
                    <TableRow
                      key={customer.id}
                      className="cursor-pointer text-sm transition-colors hover:bg-amber-50/40"
                      onClick={() => router.push(`/customers/${customer.id}`)}
                    >
                      <TableCell className="font-medium text-slate-800">{displayName(customer)}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-slate-500">
                        {customer.email || <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-rose-100 px-2 text-sm font-semibold text-rose-700">
                          {customer.total_orders}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-slate-500">
                        {customer.last_order_date
                          ? format(new Date(customer.last_order_date), "M/d/yyyy")
                          : <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {customer.common_film_process || <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {customer.common_scan_size || <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="mx-auto h-4 w-4 text-slate-400" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="px-2 text-sm text-slate-600">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </main>

      <AddCustomerForm
        open={showAdd}
        onOpenChange={setShowAdd}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["customers"] });
        }}
      />
    </div>
  );
}
