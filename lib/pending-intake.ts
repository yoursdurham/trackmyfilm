import {
  IMPORT_SOURCE_SQUARESPACE,
  PENDING_INTAKE_STATUS,
} from "@/lib/constants";
import type { FilmOrder, RollDetail } from "@/lib/types";

export function isPendingIntakeOrder(order: Pick<FilmOrder, "pending_intake" | "status">): boolean {
  return order.pending_intake === true || order.status === PENDING_INTAKE_STATUS;
}

/** Orders that have entered normal lab operations (excludes pending intake). */
export function filterOperationalOrders<T extends Pick<FilmOrder, "pending_intake" | "status">>(
  orders: T[]
): T[] {
  return orders.filter((order) => !isPendingIntakeOrder(order));
}

export type SquarespaceImportInput = {
  external_order_id: string;
  customer_name: string;
  customer_email: string;
  order_number?: string;
  order_date?: string;
  roll_count: number;
  film_type: string;
  film_process: string;
  film_stock?: string;
  roll_details?: RollDetail[];
  prints_4x6?: boolean;
  notes?: string;
};

export type PendingIntakeOrderEdits = {
  order_number?: string;
  customer_name?: string;
  customer_email?: string;
  dropoff_date?: string;
  roll_count?: number;
  film_type?: string;
  film_process?: string;
  film_stock?: string;
  roll_details?: RollDetail[];
  prints_4x6?: boolean;
  notes?: string | null;
};

export function squarespaceImportDefaults() {
  return {
    import_source: IMPORT_SOURCE_SQUARESPACE,
    pending_intake: true as const,
    status: PENDING_INTAKE_STATUS,
  };
}
