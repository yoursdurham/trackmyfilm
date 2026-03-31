export type OrderStatus = "Received by Yours" | "Received at Lab" | "Scans Sent";

export interface StatusHistoryEntry {
  status: OrderStatus;
  changed_at: string; // ISO string
}

export interface Customer {
  id: string;
  name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  normalized_name?: string;
  total_rolls: number;
  total_dropoffs: number;
  points: number;
  notes?: string;
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
  film_type: "35mm" | "120";
  film_process: "Color" | "Black & White" | "Both";
  roll_count: number;
  dropoff_date: string; // YYYY-MM-DD
  dropoff_number: number;
  wetransfer_link?: string;
  notes?: string;
  received_by_yours_at?: string;
  at_lab_at?: string;
  scans_sent_at?: string;
  received_email_sent_at?: string;
  at_lab_email_sent_at?: string;
  scans_sent_email_sent_at?: string;
  email_status?: "sent" | "failed";
  email_error?: string;
  created_at?: string;
}
