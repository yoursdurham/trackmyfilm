/**
 * POST /api/dropoff — manual physical drop-off (Received by Yours).
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createTrackMyFilmOrder } from "@/lib/order-create-service";
import type { RollDetail } from "@/lib/types";

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  let body: {
    customer_name: string;
    customer_email?: string;
    order_number: string;
    dropoff_date: string;
    roll_count: number;
    film_type: string;
    film_process: string;
    film_stock?: string;
    roll_details?: RollDetail[];
    prints_4x6?: boolean;
    notes?: string;
    send_email?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await createTrackMyFilmOrder(
    {
      customer_name: body.customer_name,
      customer_email: body.customer_email,
      order_number: body.order_number,
      dropoff_date: body.dropoff_date,
      roll_count: body.roll_count,
      film_type: body.film_type,
      film_process: body.film_process,
      film_stock: body.film_stock,
      roll_details: body.roll_details,
      prints_4x6: body.prints_4x6,
      notes: body.notes,
    },
    {
      intake_mode: "manual_received",
      send_email: body.send_email !== false,
    }
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { order, customer, createdCustomer, email } = result;

  return NextResponse.json(
    {
      success: true,
      order,
      customer: {
        id: customer.id,
        name: `${customer.first_name} ${customer.last_name ?? ""}`.trim(),
        isNew: createdCustomer,
        total_dropoffs: result.customer_total_dropoffs ?? customer.total_dropoffs,
      },
      email,
    },
    { status: 201 }
  );
}
