"use client";

import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/types";

const statusConfig: Record<OrderStatus, { bg: string; text: string; dot: string }> = {
  "Received by Yours": { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  "Received at Lab":   { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  "Scans Sent":        { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
};

export default function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as OrderStatus] ?? statusConfig["Received by Yours"];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", config.bg, config.text)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
      {status}
    </span>
  );
}
