export type OrderStatus = "Received by Yours" | "Received at Lab" | "Ready for Pickup" | "Scans Sent";

export type FilmType = "35mm" | "120" | "110" | "Disposable Camera";
export type FilmProcess = "Color" | "Black & White" | "Both";

export interface RollDetail {
  film_type: FilmType;
  film_process: FilmProcess;
  film_stock?: string;
  prints_4x6?: boolean;
  scan_size?: "Standard" | "High-Res" | "TIFF" | "Process Only";
  /** Lab returned this individual roll blank. Omitted when the roll is not blank. */
  blank?: boolean;
}

export interface StatusHistoryEntry {
  status: OrderStatus;
  changed_at: string; // ISO string
}

export type ContactMethod = "email" | "phone" | "text";
export type DeliveryPreference = "pickup" | "ship" | "email";

export interface Customer {
  id: string;
  user_id?: string;
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  normalized_name?: string;
  total_rolls: number;
  total_dropoffs: number;
  notes?: string;
  preferred_contact_method?: ContactMethod;
  default_film_type?: FilmType;
  default_film_process?: FilmProcess;
  default_scan_size?: RollDetail["scan_size"];
  default_delivery_preference?: DeliveryPreference;
  last_dropoff_date?: string;  // YYYY-MM-DD
  last_order_number?: string;
  current_rolls?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CustomerSummary extends Customer {
  total_orders: number;
  last_order_date: string | null;
  common_film_process: FilmProcess | null;
  common_scan_size: RollDetail["scan_size"] | null;
}

export type IncomingDraftStatus = "Pending Intake" | "accepted" | "dismissed";

/** A Squarespace order waiting for physical receipt. Not received and not emailed yet. */
export interface IncomingSquarespaceDraft {
  id: string;
  squarespace_order_number: string;
  external_order_id: string;
  customer_name: string;
  customer_email: string | null;
  dropoff_date: string | null;
  roll_count: number;
  roll_details: RollDetail[];
  notes: string | null;
  import_source: string;
  status: IncomingDraftStatus;
  /** Set when Approve & Receive creates the film order. Deleting that order cascades. */
  film_order_id?: string | null;
  created_at?: string;
  updated_at?: string;
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
  color_scans_wetransfer_link?: string;
  color_scans_delivered_at?: string;
  color_partial_email_sent_at?: string;
  bw_scans_wetransfer_link?: string;
  bw_scans_delivered_at?: string;
  bw_partial_email_sent_at?: string;
  notes?: string;
  customer_notes?: string;
  /** Customer-facing note included in the final scans_sent email only */
  scan_notes?: string | null;
  received_by_yours_at?: string;
  at_lab_at?: string;
  scans_sent_at?: string;
  received_email_sent_at?: string;
  at_lab_email_sent_at?: string;
  process_only_finished_emailed_at?: string;
  scans_sent_email_sent_at?: string;
  film_delay_email_sent_at?: string;
  last_emailed_at?: string;
  email_status?: "sent" | "failed";
  email_error?: string | null;
  created_at?: string;
}
