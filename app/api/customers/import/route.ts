import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
// When implemented: import { getCustomers, createCustomer } from "@/lib/db";

/**
 * POST /api/customers/import
 *
 * Reads customer data from a Google Sheet and imports it into the database.
 * Skips rows where a customer with the same name already exists.
 *
 * Expected sheet columns (case-insensitive header matching):
 *   first name, last name, email, phone, total number of rolls, dropoffcount
 *
 * Hardcoded spreadsheet: 1Ib99Bd2g-_7YKpyOOA_Zb_CmvL772eOgjiiH6MSjG5E (Sheet1!A:I)
 *
 * TODO: Implement once Google Sheets is connected.
 * Requires: GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_KEY env vars.
 *
 * See film-flow/functions/importCustomers.ts for the reference implementation.
 */
// Hardcoded spreadsheet from film-flow — update when implementing
const SPREADSHEET_ID = "1Ib99Bd2g-_7YKpyOOA_Zb_CmvL772eOgjiiH6MSjG5E";
const RANGE = "Sheet1!A:I";

export async function POST() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {

    // TODO: Connect to Google Sheets API and read rows.
    // Reference logic (from film-flow/functions/importCustomers.ts):
    //
    // 1. Authenticate via service account key
    // 2. GET https://sheets.googleapis.com/v4/spreadsheets/{id}/values/{range}
    // 3. Parse headers to find column indexes (first name, last name, email, phone, rolls, dropoffs)
    // 4. Load existing customers to build a "skip if duplicate name" set
    // 5. For each row: if name not in existing set, call createCustomer(...)
    // 6. Return { success: true, imported: N, skipped: M }

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
