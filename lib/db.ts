/**
 * Database abstraction layer.
 * TODO: implement each function with Supabase or Airtable once the DB is chosen.
 * All functions are typed — the API routes call these, never the DB directly.
 */

import type { Customer, FilmOrder, OrderStatus } from "./types";

// ─── Orders ──────────────────────────────────────────────────────────────────

export async function getOrders(sort: "desc" | "asc" = "desc"): Promise<FilmOrder[]> {
  // TODO: SELECT * FROM film_orders ORDER BY created_at DESC
  throw new Error("Not implemented");
}

export async function getOrderById(id: string): Promise<FilmOrder | null> {
  // TODO: SELECT * FROM film_orders WHERE id = $1
  throw new Error("Not implemented");
}

export async function getOrderByNumber(orderNumber: string): Promise<FilmOrder | null> {
  // TODO: SELECT * FROM film_orders WHERE order_number = $1
  throw new Error("Not implemented");
}

export async function getOrdersByCustomerId(customerId: string): Promise<FilmOrder[]> {
  // TODO: SELECT * FROM film_orders WHERE customer_id = $1 ORDER BY dropoff_date DESC
  throw new Error("Not implemented");
}

export async function createOrder(data: Omit<FilmOrder, "id">): Promise<FilmOrder> {
  // TODO: INSERT INTO film_orders (...) VALUES (...) RETURNING *
  throw new Error("Not implemented");
}

export async function updateOrder(id: string, data: Partial<FilmOrder>): Promise<FilmOrder> {
  // TODO: UPDATE film_orders SET ... WHERE id = $1 RETURNING *
  throw new Error("Not implemented");
}

export async function deleteOrder(id: string): Promise<void> {
  // TODO: DELETE FROM film_orders WHERE id = $1
  throw new Error("Not implemented");
}

// ─── Customers ───────────────────────────────────────────────────────────────

export async function getCustomers(): Promise<Customer[]> {
  // TODO: SELECT * FROM customers ORDER BY total_rolls DESC
  throw new Error("Not implemented");
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  // TODO: SELECT * FROM customers WHERE id = $1
  throw new Error("Not implemented");
}

export async function getCustomerByEmail(email: string): Promise<Customer | null> {
  // TODO: SELECT * FROM customers WHERE LOWER(email) = LOWER($1)
  throw new Error("Not implemented");
}

export async function getCustomerByNormalizedName(normalizedName: string): Promise<Customer[]> {
  // TODO: SELECT * FROM customers WHERE normalized_name = $1
  throw new Error("Not implemented");
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
  // TODO: INSERT INTO customers (...) VALUES (...) RETURNING *
  throw new Error("Not implemented");
}

export async function updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
  // TODO: UPDATE customers SET ... WHERE id = $1 RETURNING *
  throw new Error("Not implemented");
}

export async function deleteCustomer(id: string): Promise<void> {
  // TODO: DELETE FROM customers WHERE id = $1
  throw new Error("Not implemented");
}
