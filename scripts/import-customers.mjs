/**
 * scripts/import-customers.mjs
 *
 * Reads the customer CSV and imports into Supabase.
 * - Fetches all existing emails first, skips duplicates
 * - Bulk inserts new customers in batches of 100
 * - Safe to re-run
 *
 * Usage:
 *   node scripts/import-customers.mjs <path-to-csv>
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing env vars NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: node scripts/import-customers.mjs <path-to-csv>");
  process.exit(1);
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function normalizeEmail(raw) {
  if (!raw) return null;
  const e = raw.trim().toLowerCase();
  return e && e !== "." && e.includes("@") ? e : null;
}

function normalizeName(raw) {
  return (raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = [];
    let cell = "", inQuote = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { cells.push(cell); cell = ""; continue; }
      cell += ch;
    }
    cells.push(cell);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (cells[idx] ?? "").trim(); });
    rows.push(row);
  }
  return rows;
}

// ─── Parse CSV ────────────────────────────────────────────────────────────
const raw  = readFileSync(resolve(csvPath), "utf-8");
const rows = parseCsv(raw);
console.log(`\nParsed ${rows.length} rows from CSV`);

const seenEmails = new Map();
const noEmail    = [];
let skipped = 0;

for (const row of rows) {
  const email = normalizeEmail(row["Email"]);
  let first   = row["First Name"]?.trim();
  let last    = row["Last Name"]?.trim() || null;
  const full  = row["Full Name"]?.trim() || "";

  if (last && last.includes("@")) last = null;

  if (!first && full) {
    if (full.includes("@")) { skipped++; continue; }
    const parts = full.split(/\s+/);
    first = parts[0];
    if (!last && parts.length > 1) last = parts.slice(1).join(" ");
  }

  if (!first) { skipped++; continue; }

  const totalRolls = parseInt(row["Total Number of Rolls"] || "0", 10) || 0;
  const dropoffs   = parseInt(row["DropOffCount"] || "0", 10) || 0;
  const normName   = normalizeName(full || `${first} ${last ?? ""}`.trim());

  // Parse date — format is M/D/YYYY
  let lastDropoffDate = null;
  if (row["Date"]?.trim()) {
    const parts = row["Date"].trim().split("/");
    if (parts.length === 3) {
      const [m, d, y] = parts;
      lastDropoffDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }

  const lastOrderNumber = row["Order Number"]?.trim() || null;
  const parsedCurrentRolls = parseInt(row["Current Rolls"] || "", 10);
  const currentRolls = !isNaN(parsedCurrentRolls) ? parsedCurrentRolls : null;

  const record = { name: first, last_name: last, email, normalized_name: normName,
                   total_rolls: totalRolls, total_dropoffs: dropoffs,
                   last_dropoff_date: lastDropoffDate,
                   last_order_number: lastOrderNumber,
                   current_rolls: currentRolls };

  if (email) {
    const existing = seenEmails.get(email);
    if (!existing || dropoffs > existing.total_dropoffs) seenEmails.set(email, record);
  } else {
    noEmail.push(record);
  }
}

console.log(`Built ${seenEmails.size + noEmail.length} unique records (${seenEmails.size} with email, ${noEmail.length} without)`);
console.log(`Skipped ${skipped} blank/invalid rows`);

// ─── Fetch existing emails from Supabase ──────────────────────────────────
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

console.log(`\nFetching existing customers from Supabase...`);
const { data: existingRows, error: fetchError } = await supabase
  .from("customers")
  .select("id, email")
  .not("email", "is", null);

if (fetchError) {
  console.error("Failed to fetch existing customers:", fetchError.message);
  process.exit(1);
}

const existingEmailMap = new Map(existingRows.map((r) => [r.email.toLowerCase(), r.id]));
console.log(`Found ${existingEmailMap.size} existing customers in DB`);

// ─── Split into new inserts vs existing updates ────────────────────────────
const toInsert = [];
const toUpdate = []; // existing customers missing last_dropoff_date

for (const record of seenEmails.values()) {
  const existingId = existingEmailMap.get(record.email);
  if (existingId) {
    const patch = {};
    if (record.last_dropoff_date)           patch.last_dropoff_date = record.last_dropoff_date;
    if (record.last_order_number)           patch.last_order_number = record.last_order_number;
    if (record.current_rolls != null)       patch.current_rolls     = record.current_rolls;
    if (Object.keys(patch).length) toUpdate.push({ id: existingId, ...patch });
  } else {
    toInsert.push(record);
  }
}
toInsert.push(...noEmail);

console.log(`New to insert: ${toInsert.length} | Existing to update date: ${toUpdate.length}`);

const CHUNK = 100;
let inserted = 0, updated = 0;
const errors = [];

// ─── Insert new customers ──────────────────────────────────────────────────
for (let i = 0; i < toInsert.length; i += CHUNK) {
  const chunk = toInsert.slice(i, i + CHUNK);
  const { error } = await supabase.from("customers").insert(chunk);
  if (error) errors.push(`insert: ${error.message}`);
  else inserted += chunk.length;
  process.stdout.write(`\r  Inserting... ${Math.min(i + CHUNK, toInsert.length)}/${toInsert.length}`);
}

// ─── Patch last_dropoff_date on existing customers ─────────────────────────
if (toUpdate.length > 0) {
  console.log(`\n  Patching dates on existing customers...`);
  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const chunk = toUpdate.slice(i, i + CHUNK);
    for (const { id, ...patch } of chunk) {
      const { error } = await supabase
        .from("customers")
        .update(patch)
        .eq("id", id);
      if (error) errors.push(`update ${id}: ${error.message}`);
      else updated++;
    }
    process.stdout.write(`\r  Updating dates... ${Math.min(i + CHUNK, toUpdate.length)}/${toUpdate.length}`);
  }
}

console.log(`\n\nDone.`);
console.log(`  Inserted : ${inserted}`);
console.log(`  Updated  : ${updated} (last_dropoff_date patched)`);
console.log(`  Skipped  : ${skipped} (blank/invalid rows)`);
if (errors.length) {
  console.error(`\n  Errors:`);
  errors.forEach((e) => console.error(`    - ${e}`));
}
