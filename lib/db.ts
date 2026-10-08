/**
 * Database abstraction layer — Supabase implementation.
 * Uses the service role key (server-side only) to bypass RLS.
 * API routes call these functions; they never touch Supabase directly.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Customer, CustomerSummary, FilmOrder, IncomingSquarespaceDraft } from "./types";
import type { DisplayRow, HeartbeatClient } from "./display";
import { DEPARTURE_ORDER_SELECT, type DepartureOrder } from "./film-departures";
import { FILM_MENU_SLUG, type FilmMenu } from "./film-menu";
import {
  buildIncomingDraftInsert,
  incomingDraftDeleteMatch,
  type IncomingDraftInput,
  PENDING_INTAKE_STATUS,
} from "./incoming-drafts";
import { buildCustomerStatsMap, computeCustomerStats, sortCustomersByLatestOrder } from "./customer-stats";
import {
  emailsMatchExact,
  exactEmailIlikePattern,
  normalizeEmail,
  normalizeOrderNumber,
  orderNumberMatchPattern,
  preferStoredOrderNumber,
} from "./validation";

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

/** In-process orders for the public departures board. Not a select * of every order. */
export async function getInProcessDepartureOrders(): Promise<DepartureOrder[]> {
  const { data, error } = await getSupabase()
    .from("film_orders")
    .select(DEPARTURE_ORDER_SELECT)
    .in("status", ["Received by Yours", "Received at Lab"]);
  if (error) throw new Error(error.message);
  return (data ?? []) as DepartureOrder[];
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

const ORDER_NUMBER_MATCH_LIMIT = 100;

// Lookups compare the normalized key (leading zeros stripped) and return the
// stored row unchanged. "01034" finds a saved "1034", and the other way around.

function orderNumberLookup(orderNumber: string): string | null {
  const stored = normalizeOrderNumber(orderNumber);
  return stored ? stored : null;
}

export async function getOrderByNumber(orderNumber: string): Promise<FilmOrder | null> {
  if (!orderNumberLookup(orderNumber)) return null;
  const { data, error } = await getSupabase()
    .from("film_orders")
    .select("*")
    .regexIMatch("order_number", orderNumberMatchPattern(orderNumber))
    .order("created_at", { ascending: false })
    .limit(ORDER_NUMBER_MATCH_LIMIT);
  if (error) throw new Error(error.message);
  return preferStoredOrderNumber((data ?? []) as FilmOrder[], orderNumber, (row) => row.order_number);
}

export async function getOrderByNumberAndEmail(
  orderNumber: string,
  email: string
): Promise<FilmOrder | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!orderNumberLookup(orderNumber) || !normalizedEmail) return null;
  const { data, error } = await getSupabase()
    .from("film_orders")
    .select("*")
    .regexIMatch("order_number", orderNumberMatchPattern(orderNumber))
    .ilike("customer_email", exactEmailIlikePattern(normalizedEmail))
    .order("created_at", { ascending: false })
    .limit(ORDER_NUMBER_MATCH_LIMIT);
  if (error) throw new Error(error.message);
  const matches = ((data ?? []) as FilmOrder[]).filter((row) =>
    emailsMatchExact(row.customer_email, normalizedEmail)
  );
  return preferStoredOrderNumber(matches, orderNumber, (row) => row.order_number);
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
  if (!orderNumberLookup(orderNumber)) return false;
  const { data, error } = await getSupabase()
    .from("film_orders")
    .select("id")
    .regexIMatch("order_number", orderNumberMatchPattern(orderNumber))
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function getPendingIncomingDrafts(): Promise<IncomingSquarespaceDraft[]> {
  const { data, error } = await getSupabase()
    .from("incoming_squarespace_drafts")
    .select("*")
    .eq("status", PENDING_INTAKE_STATUS)
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
  if (!orderNumberLookup(orderNumber)) return null;
  const { data, error } = await getSupabase()
    .from("incoming_squarespace_drafts")
    .select("*")
    .regexIMatch("squarespace_order_number", orderNumberMatchPattern(orderNumber))
    .order("created_at", { ascending: false })
    .limit(ORDER_NUMBER_MATCH_LIMIT);
  if (error) throw new Error(error.message);
  return preferStoredOrderNumber(
    (data ?? []) as IncomingSquarespaceDraft[],
    orderNumber,
    (row) => row.squarespace_order_number,
  );
}

export async function getIncomingDraftByExternalId(
  externalOrderId: string
): Promise<IncomingSquarespaceDraft | null> {
  const { data, error } = await getSupabase()
    .from("incoming_squarespace_drafts")
    .select("*")
    .eq("external_order_id", externalOrderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as IncomingSquarespaceDraft | null;
}

export async function createIncomingDraft(data: IncomingDraftInput): Promise<IncomingSquarespaceDraft> {
  const { data: created, error } = await getSupabase()
    .from("incoming_squarespace_drafts")
    .insert(buildIncomingDraftInsert(data))
    .select()
    .single();
  if (error) {
    const err = new Error(error.message) as Error & { code?: string };
    err.code = error.code;
    throw err;
  }
  return created as IncomingSquarespaceDraft;
}

function isMissingFilmOrderLinkColumn(error: { message?: string; code?: string }): boolean {
  const message = (error.message ?? "").toLowerCase();
  if (!message.includes("film_order_id")) return false;
  return error.code === "42703"
    || error.code === "PGRST204"
    || message.includes("schema cache")
    || message.includes("does not exist");
}

export async function updateIncomingDraftStatus(
  id: string,
  status: "accepted",
  filmOrderId?: string
): Promise<IncomingSquarespaceDraft> {
  const updatedAt = new Date().toISOString();
  const write = (includeLink: boolean) => {
    const patch: { status: "accepted"; updated_at: string; film_order_id?: string } = {
      status,
      updated_at: updatedAt,
    };
    if (includeLink && filmOrderId) patch.film_order_id = filmOrderId;
    return getSupabase()
      .from("incoming_squarespace_drafts")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
  };

  let { data: updated, error } = await write(Boolean(filmOrderId));
  if (error && filmOrderId && isMissingFilmOrderLinkColumn(error)) {
    ({ data: updated, error } = await write(false));
  }
  if (error) throw new Error(error.message);
  return updated as IncomingSquarespaceDraft;
}

/** Removes the intake row. Does not touch film orders. */
export async function deleteIncomingDraft(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from("incoming_squarespace_drafts")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Removes intake rows that share this film order's number or Squarespace external id.
 * Also removes a row linked by film_order_id when that column exists.
 */
export async function deleteIncomingDraftsForOrder(order: {
  id?: string;
  order_number: string;
  external_order_id?: string | null;
}): Promise<void> {
  if (order.id) {
    const { error } = await getSupabase()
      .from("incoming_squarespace_drafts")
      .delete()
      .eq("film_order_id", order.id);
    if (error && !isMissingFilmOrderLinkColumn(error)) throw new Error(error.message);
  }

  const match = incomingDraftDeleteMatch(order);
  for (const orderNumber of match.orderNumbers) {
    const { error } = await getSupabase()
      .from("incoming_squarespace_drafts")
      .delete()
      .regexIMatch("squarespace_order_number", orderNumberMatchPattern(orderNumber));
    if (error) throw new Error(error.message);
  }
  for (const externalOrderId of match.externalOrderIds) {
    const { error } = await getSupabase()
      .from("incoming_squarespace_drafts")
      .delete()
      .regexIMatch("external_order_id", orderNumberMatchPattern(externalOrderId));
    if (error) throw new Error(error.message);
  }
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
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  let query = getSupabase()
    .from("customers")
    .select("*")
    .ilike("email", exactEmailIlikePattern(normalized));

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query.limit(20);
  if (error) throw new Error(error.message);
  const matches = ((data ?? []) as Customer[]).filter((row) => emailsMatchExact(row.email, normalized));
  return matches[0] ?? null;
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

// ─── Displays ────────────────────────────────────────────────────────────────

export async function listDisplays(): Promise<DisplayRow[]> {
  const { data, error } = await getSupabase()
    .from("displays")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DisplayRow[];
}

export async function getDisplayBySlug(slug: string): Promise<DisplayRow | null> {
  const { data, error } = await getSupabase()
    .from("displays")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as DisplayRow | null;
}

export async function updateDisplay(slug: string, patch: Partial<DisplayRow>): Promise<DisplayRow | null> {
  const { data, error } = await getSupabase()
    .from("displays")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("slug", slug)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as DisplayRow | null;
}

export async function getFilmMenu(): Promise<unknown | null> {
  const { data, error } = await getSupabase()
    .from("film_menus")
    .select("content")
    .eq("slug", FILM_MENU_SLUG)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.content ?? null;
}

export async function saveFilmMenu(content: FilmMenu): Promise<FilmMenu> {
  const { data, error } = await getSupabase()
    .from("film_menus")
    .upsert(
      {
        slug: FILM_MENU_SLUG,
        content,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    )
    .select("content")
    .single();
  if (error) throw new Error(error.message);
  return data.content as FilmMenu;
}

export async function touchDisplayHeartbeat(slug: string, client: HeartbeatClient): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("displays")
    .update({
      last_seen: new Date().toISOString(),
      last_client: client,
      updated_at: new Date().toISOString(),
    })
    .eq("slug", slug)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}
