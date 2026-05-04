/**
 * Database abstraction layer — Supabase implementation.
 * Uses the service role key (server-side only) to bypass RLS.
 * API routes call these functions; they never touch Supabase directly.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Customer, FilmOrder } from "./types";

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

export async function getDistinctFilmStocks(): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("film_orders")
    .select("film_stock")
    .not("film_stock", "is", null);
  if (error) throw new Error(error.message);
  const stocks = [...new Set((data as { film_stock: string }[]).map((r) => r.film_stock).filter(Boolean))];
  return stocks.sort();
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

export async function getCustomerByEmail(email: string): Promise<Customer | null> {
  const { data, error } = await getSupabase()
    .from("customers")
    .select("*")
    .ilike("email", email)
    .maybeSingle();
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

export async function createCustomer(data: Omit<Customer, "id">): Promise<Customer> {
  const { data: created, error } = await getSupabase()
    .from("customers")
    .insert(data)
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
