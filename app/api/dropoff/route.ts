/**
 * POST /api/dropoff
 * Single atomic endpoint for creating a new film drop-off.
 *
 * Does in one server-side call:
 *   1. Look up customer by email or normalized name
 *   2. Create customer if not found
 *   3. Create the film_orders row
 *   4. Update customer totals (total_rolls, total_dropoffs, last_order_number, current_rolls, last_dropoff_date)
 *   5. Send the right email:
 *        - 10th drop-off → loyalty_10 email
 *        -  5th drop-off → loyalty_5 email
 *        - Otherwise     → regular confirmation email
 *
 * Returns full result including email outcome so the client always knows what happened.
 * Nothing fails silently — all errors are returned in the response.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createFilmDropoff, type DropoffRequest } from "@/lib/dropoff-service";

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  let body: DropoffRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await createFilmDropoff(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.body, { status: 201 });
}
