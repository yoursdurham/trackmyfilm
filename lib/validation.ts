/**
 * Pure business-logic helpers with no side-effects.
 * These are the source of truth for validation rules — API routes and tests both import from here.
 */

import { STATUS_FLOW } from "./constants";
import type { OrderStatus } from "./types";

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Returns true only for valid forward transitions.
 * Backward transitions require `force: true` on the API call.
 */
export function isValidTransition(current: OrderStatus, next: OrderStatus): boolean {
  return STATUS_FLOW.indexOf(next) > STATUS_FLOW.indexOf(current);
}

/**
 * Returns true if a status is a known value in STATUS_FLOW.
 */
export function isKnownStatus(status: string): status is OrderStatus {
  return (STATUS_FLOW as string[]).includes(status);
}

/**
 * Returns true if the last email send for this template was within the dedup window (1 hour).
 */
export function isWithinDedupWindow(lastSentAt: string | undefined | null): boolean {
  if (!lastSentAt) return false;
  return Date.now() - new Date(lastSentAt).getTime() < ONE_HOUR_MS;
}

/**
 * Normalises a customer-facing name for dedup comparisons:
 * trim, collapse internal whitespace, lowercase.
 */
export function normalizeCustomerName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Normalises an email address: trim + lowercase.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalises an order number: trim + uppercase.
 */
export function normalizeOrderNumber(num: string): string {
  return num.trim().toUpperCase();
}

/**
 * Returns true if `url` is a valid http(s) URL.
 * If no scheme is provided, https:// is assumed before validation.
 */
export function isValidUrl(url: string): boolean {
  try {
    let normalized = url.trim();
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      normalized = "https://" + normalized;
    }
    const parsedUrl = new URL(normalized);
    return ["http:", "https:"].includes(parsedUrl.protocol) && Boolean(parsedUrl.hostname);
  } catch {
    return false;
  }
}

export const isValidWetransferLink = isValidUrl;

/**
 * Prepends https:// to a URL if no scheme is present.
 */
export function ensureHttps(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return "https://" + trimmed;
  }
  return trimmed;
}
