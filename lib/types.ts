export type OrderStatus = "Received by Yours" | "Received at Lab" | "Scans Sent";

export type FilmType = "35mm" | "120" | "Disposable Camera";
export type FilmProcess = "Color" | "Black & White" | "Both";

export interface RollDetail {
  film_type: FilmType;
  film_process: FilmProcess;
  film_stock?: string;
  prints_4x6?: boolean;
}

export interface StatusHistoryEntry {
  status: OrderStatus;
  changed_at: string; // ISO string
}

export interface Customer {
  id: string;
  name: string;
  last_name?: string;
  email?: string;
  normalized_name?: string;
  total_rolls: number;
  total_dropoffs: number;
  notes?: string;
  last_dropoff_date?: string;  // YYYY-MM-DD
  last_order_number?: string;
  current_rolls?: number;
  created_at?: string;
}

export interface FilmOrder {
  id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  status: OrderStatus;
  status_history: StatusHistoryEntry[];
  status_updated_at: string;
  film_type: FilmType;
  film_process: FilmProcess;
  film_stock?: string;
  roll_count: number;
  roll_details?: RollDetail[];
  prints_4x6?: boolean;
  dropoff_date: string; // YYYY-MM-DD
  dropoff_number: number;
  wetransfer_link?: string;
  notes?: string;
  customer_notes?: string;
  received_by_yours_at?: string;
  at_lab_at?: string;
  scans_sent_at?: string;
  received_email_sent_at?: string;
  at_lab_email_sent_at?: string;
  scans_sent_email_sent_at?: string;
  email_status?: "sent" | "failed";
  email_error?: string | null;
  created_at?: string;
}
