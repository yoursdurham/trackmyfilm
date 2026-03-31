import { NextResponse } from "next/server";
import { getOrders } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

/**
 * POST /api/sheets/raleigh
 *
 * Creates a Google Sheet listing all orders with status "Received at Lab"
 * — these are the orders being sent to the Raleigh lab.
 *
 * Columns: Order #, Customer Name, Roll Count, Drop-off Date, Drop-off #
 *
 * TODO: Implement once Google Sheets is connected.
 * Requires: GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_KEY env vars
 * (or use a Google OAuth token stored in your DB).
 *
 * See film-flow/functions/createRaleighSheet.ts for the reference implementation.
 */
export async function POST() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const orders = await getOrders();
    const labOrders = orders.filter((o) => o.status === "Received at Lab");

    // TODO: Connect to Google Sheets API and create spreadsheet.
    // Reference logic (from film-flow/functions/createRaleighSheet.ts):
    //
    // 1. Authenticate via service account or OAuth token
    // 2. POST to https://sheets.googleapis.com/v4/spreadsheets to create new sheet
    //    titled "Raleigh Lab Delivery - <date>"
    // 3. PUT rows: headers + labOrders.map(o => [order_number, customer_name, roll_count, dropoff_date, dropoff_number])
    // 4. PATCH to bold + color the header row
    // 5. Return { success: true, spreadsheetUrl, orderCount }

    return NextResponse.json(
      { error: "Google Sheets not yet connected — set GOOGLE_SERVICE_ACCOUNT_KEY in .env.local" },
      { status: 501 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
