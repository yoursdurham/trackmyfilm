"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Inbox, Upload } from "lucide-react";
import OrderCard from "@/components/OrderCard";
import type { PendingIntakeOrderEdits } from "@/lib/pending-intake";
import type { FilmOrder } from "@/lib/types";

type Props = {
  orders: FilmOrder[];
  onApproveIntake: (orderId: string, edits?: PendingIntakeOrderEdits) => Promise<void>;
  onDelete: (id: string) => void;
  onOrderUpdated: () => void;
  onImportClick?: () => void;
};

export default function PendingIntakeSection({
  orders,
  onApproveIntake,
  onDelete,
  onOrderUpdated,
  onImportClick,
}: Props) {
  return (
    <section className="mb-8 rounded-xl border border-sky-200 bg-sky-50/40 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Pending Intake</h2>
            <p className="text-sm text-slate-600">
              Squarespace imports waiting for physical drop-off — not visible to customers yet.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onImportClick ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-sky-300 bg-white text-sky-800 hover:bg-sky-100"
              onClick={onImportClick}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              Import to Pending Intake
            </Button>
          ) : null}
          <span className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white">
            {orders.length} pending
          </span>
        </div>
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-slate-600">
          No pending imports. Use Import to Pending Intake to add a Squarespace order for staff review.
        </p>
      ) : null}

      <motion.div layout className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {orders.map((order) => (
            <motion.div
              key={order.id}
              layout
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <OrderCard
                order={order}
                pendingIntake
                onStatusChange={async () => {}}
                onDelete={onDelete}
                onOrderUpdated={onOrderUpdated}
                onApproveIntake={onApproveIntake}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
