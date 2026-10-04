"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import InternalHeader from "@/components/InternalHeader";
import OrderCard from "@/components/OrderCard";
import { STAFF_HOME, staffOrderDetailPath } from "@/lib/staff-navigation";
import type { FilmOrder } from "@/lib/types";

export default function StaffOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: order, isLoading, isError, error } = useQuery<FilmOrder>({
    queryKey: ["filmOrder", id],
    queryFn: async () => {
      const response = await fetch(`/api/orders/${id}`);
      if (response.status === 401) {
        const login = new URL("/login", window.location.origin);
        login.searchParams.set("redirectTo", staffOrderDetailPath(id));
        window.location.assign(login.toString());
        throw new Error("Sign in required");
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Order not found");
      }
      return response.json();
    },
  });

  const handleStatusChange = async (
    orderId: string,
    status: string,
    wetransferLink?: string,
    force?: boolean,
    sendEmail?: boolean,
    scanNotes?: string | null,
  ) => {
    try {
      const response = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          new_status: status,
          wetransfer_link: wetransferLink,
          scan_notes: scanNotes,
          force,
          send_email: sendEmail,
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success(`Order updated to ${status}`);
        queryClient.invalidateQueries({ queryKey: ["filmOrder", id] });
        queryClient.invalidateQueries({ queryKey: ["filmOrders"] });
      } else {
        toast.error(data.error || "Failed to update order");
      }
    } catch {
      toast.error("Failed to update order");
    }
  };

  const handleDelete = async (orderId: string) => {
    const response = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      toast.error(body?.error ?? "Failed to delete order");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["filmOrders"] });
    queryClient.invalidateQueries({ queryKey: ["incomingDrafts"] });
    toast.success("Order deleted");
    router.push(STAFF_HOME);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-orange-50/30 to-amber-50/20">
      <InternalHeader
        title={order ? `Order #${order.order_number}` : "Order"}
        subtitle="Drop-off detail"
      />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Link href={STAFF_HOME} className="mb-4 inline-flex text-sm text-slate-600 hover:text-slate-800">
          ← All drop-offs
        </Link>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          </div>
        ) : isError || !order ? (
          <div className="rounded-xl border border-stone-200 bg-white p-6 text-center">
            <p className="text-slate-700">{error instanceof Error ? error.message : "Order not found"}</p>
            <Link href={STAFF_HOME} className="mt-3 inline-flex text-sm font-medium text-amber-700 hover:underline">
              Back to the dashboard
            </Link>
          </div>
        ) : (
          <OrderCard
            order={order}
            initialDetailsOpen
            linkOrderNumber={false}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
            onOrderUpdated={() => {
              queryClient.invalidateQueries({ queryKey: ["filmOrder", id] });
              queryClient.invalidateQueries({ queryKey: ["filmOrders"] });
            }}
          />
        )}
      </main>
    </div>
  );
}
