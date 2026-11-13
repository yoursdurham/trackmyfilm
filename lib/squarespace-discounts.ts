/**
 * Squarespace Discounts API (v1, GA July 2026).
 * https://developers.squarespace.com/commerce-apis/discounts-overview
 * The API key is SQUARESPACE_DISCOUNTS_API_KEY. Never hardcode it.
 */

import { SQUARESPACE_USER_AGENT } from "@/lib/squarespace-orders";
import {
  SQUARESPACE_DISCOUNTS_ENDPOINT,
  type DiscountSnapshot,
} from "@/lib/rewards";

const MAX_PAGES = 20;

export class SquarespaceDiscountError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SquarespaceDiscountError";
    this.status = status;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseDiscountSnapshot(value: unknown): DiscountSnapshot | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = readString(record.id);
  if (!id) return null;
  const trigger = asRecord(record.trigger);
  const promoCode = readString(trigger?.promoCode) ?? readString(record.promoCode) ?? "";
  const uses = record.numberOfUses;
  return {
    id,
    promoCode,
    numberOfUses: typeof uses === "number" && Number.isFinite(uses) ? uses : 0,
    validTo: readString(record.validTo),
    status: readString(record.status),
  };
}

export function parseDiscountList(body: unknown): { discounts: DiscountSnapshot[]; hasNextPage: boolean } {
  const record = asRecord(body);
  const list = Array.isArray(body)
    ? body
    : Array.isArray(record?.discounts)
      ? record.discounts
      : [];
  return {
    discounts: list.flatMap((entry) => {
      const parsed = parseDiscountSnapshot(entry);
      return parsed ? [parsed] : [];
    }),
    hasNextPage: record?.hasNextPage === true,
  };
}

export function parseCreatedDiscount(body: unknown): { id: string; promoCode: string } | null {
  const record = asRecord(body);
  const discount = asRecord(record?.discount) ?? record;
  const parsed = parseDiscountSnapshot(discount);
  if (!parsed?.id || !parsed.promoCode) return null;
  return { id: parsed.id, promoCode: parsed.promoCode };
}

function discountHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": SQUARESPACE_USER_AGENT,
    Accept: "application/json",
  };
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) return `Squarespace returned ${response.status}`;
  try {
    const body = JSON.parse(text) as { message?: unknown };
    if (typeof body.message === "string" && body.message.trim()) return body.message.trim();
  } catch {
    // The body was not JSON.
  }
  return text.slice(0, 300);
}

export async function createSquarespaceDiscount(
  fetchImpl: typeof fetch,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ id: string; promoCode: string }> {
  const response = await fetchImpl(SQUARESPACE_DISCOUNTS_ENDPOINT, {
    method: "POST",
    cache: "no-store",
    headers: {
      ...discountHeaders(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (response.status !== 201 && !response.ok) {
    throw new SquarespaceDiscountError(await readError(response), response.status);
  }
  const created = parseCreatedDiscount(await response.json());
  if (!created) throw new SquarespaceDiscountError("Squarespace did not return a discount id", response.status);
  return created;
}

export async function listSquarespaceRewardDiscounts(
  fetchImpl: typeof fetch,
  apiKey: string,
): Promise<DiscountSnapshot[]> {
  const collected: DiscountSnapshot[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(SQUARESPACE_DISCOUNTS_ENDPOINT);
    url.searchParams.set("search", "TMF-");
    url.searchParams.set("trigger", "CODE");
    url.searchParams.set("limit", "100");
    url.searchParams.set("offset", String(page * 100));
    const response = await fetchImpl(url, {
      method: "GET",
      cache: "no-store",
      headers: discountHeaders(apiKey),
    });
    if (!response.ok) {
      throw new SquarespaceDiscountError(await readError(response), response.status);
    }
    const parsed = parseDiscountList(await response.json());
    collected.push(...parsed.discounts);
    if (!parsed.hasNextPage || parsed.discounts.length === 0) break;
  }
  return collected;
}

export async function deleteSquarespaceDiscount(
  fetchImpl: typeof fetch,
  apiKey: string,
  discountId: string,
): Promise<void> {
  const response = await fetchImpl(`${SQUARESPACE_DISCOUNTS_ENDPOINT}/${encodeURIComponent(discountId)}`, {
    method: "DELETE",
    cache: "no-store",
    headers: discountHeaders(apiKey),
  });
  if (response.status === 404) return;
  if (!response.ok && response.status !== 204) {
    throw new SquarespaceDiscountError(await readError(response), response.status);
  }
}
