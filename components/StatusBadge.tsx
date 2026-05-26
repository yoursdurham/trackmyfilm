"use client";

import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/types";

const statusConfig: Record<OrderStatus, { bg: string; text: string; dot: string }> = {
  "Received by Yours": {
    bg: "bg-[var(--accent-tan)]",
    text: "text-[#A77B43]",
    dot: "bg-[#A77B43]",
  },
  "Received at Lab": {
    bg: "bg-[var(--accent-purple)]",
    text: "text-white",
    dot: "bg-white",
  },
  "Ready for Pickup": {
    bg: "bg-amber-500",
    text: "text-white",
    dot: "bg-white",
  },
  "Scans Sent": {
    bg: "bg-[var(--accent-green)]",
    text: "text-white",
    dot: "bg-white",
  },
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
