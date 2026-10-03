/**
 * Database abstraction layer — Supabase implementation.
 * Uses the service role key (server-side only) to bypass RLS.
 * API routes call these functions; they never touch Supabase directly.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Customer, CustomerSummary, FilmOrder, IncomingSquarespaceDraft } from "./types";
import type { IncomingDraftInput } from "./incoming-drafts";
import { buildCustomerStatsMap, computeCustomerStats, sortCustomersByLatestOrder } from "./customer-stats";

type CustomerInsert = Omit<Customer, "id" | "created_at">;

// Singleton — reuse one client per worker instead of creating a new connection
// on every DB call. Eliminates repeated TCP handshakes on hot paths.
let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  _supabase = createClient(url, key, {
    auth: { persistSession: false },
  });
  return _supabase;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export async function getOrders(sort: "desc" | "asc" = "desc"): Promise<FilmOrder[]> {
  const { data, error } = await getSupabase()
    .from("film_orders")
    .select("*")
    .order("created_at", { ascending: sort === "asc" });
  if (error) throw new Error(error.message);
  return data as FilmOrder[];
}

export async function getOrderById(id: string): Promise<FilmOrder | null> {
  const { data, error } = await getSupabase()
    .from("film_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as FilmOrder | null;
}

export async function getOrderByNumber(orderNumber: string): Promise<FilmOrder | null> {
  const { data, error } = await getSupabase()
    .from("film_orders")
    .select("*")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as FilmOrder | null;
}

export async function getOrderByNumberAndEmail(
  orderNumber: string,
  email: string
): Promise<FilmOrder | null> {
  const { data, error } = await getSupabase()
    .from("film_orders")
    .select("*")
    .eq("order_number", orderNumber)
    .ilike("customer_email", email)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as FilmOrder | null;
}

export async function getOrdersByCustomerId(customerId: string): Promise<FilmOrder[]> {
  const { data, error } = await getSupabase()
    .from("film_orders")
    .select("*")
    .eq("customer_id", customerId)
    .order("dropoff_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data as FilmOrder[];
}

export async function createOrder(data: Omit<FilmOrder, "id">): Promise<FilmOrder> {
  const { data: created, error } = await getSupabase()
    .from("film_orders")
    .insert(data)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return created as FilmOrder;
}

export async function updateOrder(id: string, data: Partial<FilmOrder>): Promise<FilmOrder> {
  const { data: updated, error } = await getSupabase()
    .from("film_orders")
    .update(data)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return updated as FilmOrder;
}

/** Updates customer_email on every order linked by customer_id (not by email match). */
export async function updateOrdersCustomerEmailByCustomerId(
  customerId: string,
  customerEmail: string,
): Promise<number> {
  const { data, error } = await getSupabase()
    .from("film_orders")
    .update({ customer_email: customerEmail })
    .eq("customer_id", customerId)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function getDistinctFilmStocks(): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("film_orders")
    .select("film_stock")
    .not("film_stock", "is", null);
  if (error) throw new Error(error.message);
  const stocks = [...new Set((data as { film_stock: string }[]).map((r) => r.film_stock).filter(Boolean))];
  return stocks.sort();
}

export async function getOrdersPendingDelayEmail(): Promise<FilmOrder[]> {
  const { data, error } = await getSupabase()
    .from("film_orders")
    .select("*")
    .eq("status", "Received at Lab")
    .is("film_delay_email_sent_at", null);
  if (error) throw new Error(error.message);
  return data as FilmOrder[];
}

// ─── Incoming Squarespace drafts ─────────────────────────────────────────────
// Intake creation uses only these helpers plus orderNumberExists.
// Do not add customer reads, order creation, or email sends on that path.

export async function orderNumberExists(orderNumber: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("film_orders")
    .select("id")
    .eq("order_number", orderNumber)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data != null;
}

export async function getPendingIncomingDrafts(): Promise<IncomingSquarespaceDraft[]> {
  const { data, error } = await getSupabase()
    .from("incoming_squarespace_drafts")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as IncomingSquarespaceDraft[];
}

export async function getIncomingDraftById(id: string): Promise<IncomingSquarespaceDraft | null> {
  const { data, error } = await getSupabase()
    .from("incoming_squarespace_drafts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as IncomingSquarespaceDraft | null;
}

export async function getIncomingDraftByOrderNumber(
  orderNumber: string
): Promise<IncomingSquarespaceDraft | null> {
  const { data, error } = await getSupabase()
    .from("incoming_squarespace_drafts")
    .select("*")
    .eq("squarespace_order_number", orderNumber)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as IncomingSquarespaceDraft | null;
}

export async function createIncomingDraft(data: IncomingDraftInput): Promise<IncomingSquarespaceDraft> {
  const { data: created, error } = await getSupabase()
    .from("incoming_squarespace_drafts")
    .insert({
      squarespace_order_number: data.squarespace_order_number,
      customer_name: data.customer_name,
      customer_email: data.customer_email,
      dropoff_date: data.dropoff_date,
      roll_count: data.roll_count,
      roll_details: data.roll_details,
      notes: data.notes,
      source: data.source,
      status: "pending",
    })
    .select()
    .single();
  if (error) {
    const err = new Error(error.message) as Error & { code?: string };
    err.code = error.code;
    throw err;
  }
  return created as IncomingSquarespaceDraft;
}

export async function updateIncomingDraftStatus(
  id: string,
  status: "accepted" | "dismissed"
): Promise<IncomingSquarespaceDraft> {
  const { data: updated, error } = await getSupabase()
    .from("incoming_squarespace_drafts")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return updated as IncomingSquarespaceDraft;
}

export async function deleteOrder(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from("film_orders")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Customers ───────────────────────────────────────────────────────────────

export async function getCustomers(): Promise<Customer[]> {
  const { data, error } = await getSupabase()
    .from("customers")
    .select("*")
    .order("total_rolls", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Customer[];
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const { data, error } = await getSupabase()
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Customer | null;
}

export async function getCustomersWithSummaries(): Promise<CustomerSummary[]> {
  const [customers, orders] = await Promise.all([getCustomers(), getOrders("desc")]);
  const statsMap = buildCustomerStatsMap(orders);

  const withSummaries = customers.map((customer) => {
    const stats = statsMap.get(customer.id) ?? computeCustomerStats([]);
    return {
      ...customer,
      total_orders: stats.total_orders,
      last_order_date: stats.last_order_date,
      common_film_process: stats.common_film_process,
      common_scan_size: stats.common_scan_size,
    };
  });

  return sortCustomersByLatestOrder(withSummaries);
}

export async function getCustomerProfile(id: string) {
  const customer = await getCustomerById(id);
  if (!customer) return null;
  const orders = await getOrdersByCustomerId(id);
  const stats = computeCustomerStats(orders);
  return { customer, orders, stats };
}

export async function getCustomerByEmail(email: string, userId?: string | null): Promise<Customer | null> {
  let query = getSupabase()
    .from("customers")
    .select("*")
    .ilike("email", email);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data as Customer | null;
}

export async function getCustomerByNormalizedName(normalizedName: string): Promise<Customer[]> {
  const { data, error } = await getSupabase()
    .from("customers")
    .select("*")
    .eq("normalized_name", normalizedName);
  if (error) throw new Error(error.message);
  return data as Customer[];
}

export async function getCustomerByEmailOrName(
  email: string | null,
  normalizedName: string | null
): Promise<Customer | null> {
  if (email) {
    const byEmail = await getCustomerByEmail(email);
    if (byEmail) return byEmail;
  }
  if (normalizedName) {
    const byName = await getCustomerByNormalizedName(normalizedName);
    if (byName.length === 1) return byName[0];
  }
  return null;
}

export async function createCustomer(data: CustomerInsert): Promise<Customer> {
  const row = Object.fromEntries(
    Object.entries({
      user_id: data.user_id,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone,
      normalized_name: data.normalized_name,
      total_rolls: data.total_rolls,
      total_dropoffs: data.total_dropoffs,
      notes: data.notes,
      preferred_contact_method: data.preferred_contact_method,
      default_film_type: data.default_film_type,
      default_film_process: data.default_film_process,
      default_scan_size: data.default_scan_size,
      default_delivery_preference: data.default_delivery_preference,
      last_dropoff_date: data.last_dropoff_date,
      last_order_number: data.last_order_number,
      current_rolls: data.current_rolls,
    }).filter(([, value]) => value !== undefined)
  );

  const { data: created, error } = await getSupabase()
    .from("customers")
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return created as Customer;
}

export async function updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
  const { data: updated, error } = await getSupabase()
    .from("customers")
    .update(data)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return updated as Customer;
}

export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from("customers")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
