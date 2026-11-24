/**
 * Resend rejects a template send when any string variable is over 2,000
 * characters (`validation_error` on `template.variables.value`).
 *
 * Every published order template has one roll-list slot, `film_details_html`,
 * and no plain-text twin. Numbered slots such as `film_details_html_2` would
 * need a template edit, so large orders stay in this one value: identical
 * stock, format, and process are grouped, the markup stays compact, and a
 * list that still does not fit ends with "and N more rolls". `roll_count`
 * remains the order total.
 *
 * `notes`, `scan_notes`, and `scan_notes_html` can also grow. The cap below
 * runs on every variable before the request is sent.
 */

import { filmProductUrl } from "@/lib/film-product-links";
import { correctFilmStockSpelling } from "@/lib/film-stocks";

export const RESEND_TEMPLATE_VARIABLE_LIMIT = 2000;

const OMISSION_FALLBACK = "The rest of this did not fit.";
const STOCK_LABEL_MAX = 80;

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

type RollGroup = {
  count: number;
  stock: string;
  format: string;
  process: string;
  scan: string;
  prints: boolean;
  href: string | null;
};

type PackedList = {
  html: string;
  shownRolls: number;
  omitted: number;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clipStock(stock: string): string {
  if (stock.length <= STOCK_LABEL_MAX) return stock;
  return `${stock.slice(0, STOCK_LABEL_MAX - 3).trimEnd()}...`;
}

function lineHtml(group: RollGroup, linkStock: boolean): string {
  const stock = clipStock(group.stock);
  const stockHtml = linkStock && group.href && stock
    ? `<a href="${escapeHtml(group.href)}">${escapeHtml(stock)}</a>`
    : escapeHtml(stock);
  const details = [group.format, group.process, group.scan, group.prints ? "4x6 prints" : ""]
    .filter((part) => part.length > 0)
    .map(escapeHtml);
  const bits = [stockHtml, ...details].filter((part) => part.length > 0);
  const label = bits.join(", ");
  return group.count === 1 ? label : `${group.count} x ${label}`;
}

function moreRollsLine(omitted: number): string {
  return omitted === 1 ? "and 1 more roll" : `and ${omitted} more rolls`;
}

function assemble(lines: string[], omitted: number): string {
  const parts = [...lines];
  if (omitted > 0) parts.push(moreRollsLine(omitted));
  return parts.join("<br>");
}

function pack(lines: string[], counts: number[]): PackedList {
  const total = counts.reduce((sum, count) => sum + count, 0);
  const summary = total === 1 ? "1 roll" : `${total} rolls`;
  let best: PackedList = { html: summary, shownRolls: 0, omitted: total };

  for (let keep = 1; keep <= lines.length; keep += 1) {
    const shownRolls = counts.slice(0, keep).reduce((sum, count) => sum + count, 0);
    const omitted = total - shownRolls;
    const html = assemble(lines.slice(0, keep), omitted);
    if (html.length > RESEND_TEMPLATE_VARIABLE_LIMIT) break;
    best = { html, shownRolls, omitted };
  }

  return best;
}

function chooseList(groups: RollGroup[]): PackedList {
  const counts = groups.map((group) => group.count);
  const linked = pack(groups.map((group) => lineHtml(group, true)), counts);
  if (linked.omitted === 0) return linked;

  const plain = pack(groups.map((group) => lineHtml(group, false)), counts);
  if (plain.omitted < linked.omitted) return plain;
  return linked.shownRolls > 0 ? linked : plain;
}

/**
 * Grouped roll list for `film_details_html`. The published templates place
 * this value inside a paragraph, so lines are separated with `<br>` and carry
 * no extra inline styles.
 */
export function buildFilmDetailsHtml(rollDetails: unknown): string {
  if (!Array.isArray(rollDetails) || rollDetails.length === 0) return "";

  const groups = new Map<string, RollGroup>();

  for (const roll of rollDetails) {
    if (!roll || typeof roll !== "object") continue;
    const record = roll as {
      film_type?: unknown;
      film_process?: unknown;
      scan_size?: unknown;
      film_stock?: unknown;
      prints_4x6?: unknown;
    };
    const stock = correctFilmStockSpelling(textOf(record.film_stock)).replace(/\s+/g, " ").trim();
    const format = textOf(record.film_type);
    const process = textOf(record.film_process);
    const scan = textOf(record.scan_size);
    const prints = record.prints_4x6 === true;
    if (!stock && !format && !process && !scan && !prints) continue;

    const key = [stock.toLowerCase(), format, process, scan, prints ? "prints" : ""].join("\u0000");
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    groups.set(key, {
      count: 1,
      stock,
      format,
      process,
      scan,
      prints,
      href: stock ? filmProductUrl(stock, format) : null,
    });
  }

  const grouped = [...groups.values()];
  if (grouped.length === 0) return "";

  const chosen = chooseList(grouped);
  if (chosen.omitted > 0) {
    console.warn("[email] Film list was shortened to stay under 2000 characters:", {
      rolls: chosen.shownRolls + chosen.omitted,
      listed: chosen.shownRolls,
      omitted: chosen.omitted,
      length: chosen.html.length,
    });
  }
  return chosen.html;
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][^<>]*>/i.test(value);
}

function closeTags(stack: string[]): string {
  let closers = "";
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    closers += `</${stack[index]}>`;
  }
  return closers;
}

function applyTag(stack: string[], rawInner: string): void {
  const raw = rawInner.trim();
  if (!raw || raw.startsWith("!") || raw.startsWith("?")) return;

  const closing = raw.startsWith("/");
  const body = raw.replace(/^\/+/, "").replace(/\/+$/, "").trim();
  const name = body.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!name) return;

  if (closing) {
    if (stack[stack.length - 1] === name) stack.pop();
    return;
  }

  const selfClosing = /\/\s*$/.test(raw) || VOID_TAGS.has(name);
  if (!selfClosing) stack.push(name);
}

function truncatePlain(value: string, max: number): string {
  const fallback = `\n${OMISSION_FALLBACK}`;
  if (fallback.length >= max) return fallback.slice(0, max);

  const budget = max - fallback.length;
  let cut = Math.min(value.length, budget);
  const space = value.lastIndexOf(" ", cut);
  if (space >= budget - 40 && space > 0) cut = space;

  const amp = value.lastIndexOf("&", cut - 1);
  const semi = value.lastIndexOf(";", cut - 1);
  if (amp > semi && cut - amp <= 16) cut = amp;

  const prefix = value.slice(0, cut).trimEnd();
  return `${prefix}${fallback}`;
}

/**
 * Shortens one template value without ending inside a tag or an HTML entity.
 * Open tags that were cut through are closed before the fallback line.
 */
export function truncateResendTemplateValue(
  value: string,
  max = RESEND_TEMPLATE_VARIABLE_LIMIT,
): string {
  if (value.length <= max) return value;
  if (!looksLikeHtml(value)) return truncatePlain(value, max);

  const fallback = `<br>${OMISSION_FALLBACK}`;
  if (fallback.length >= max) return fallback.slice(0, max);

  const room = max - fallback.length;
  const stack: string[] = [];
  let index = 0;
  let bestIndex = 0;
  let bestClosers = "";

  const consider = () => {
    const closers = closeTags(stack);
    if (index + closers.length <= room) {
      bestIndex = index;
      bestClosers = closers;
    }
  };

  consider();

  while (index < value.length && index < room) {
    const char = value[index];
    if (char === "<") {
      const end = value.indexOf(">", index + 1);
      if (end === -1 || end >= room) break;
      applyTag(stack, value.slice(index + 1, end));
      index = end + 1;
      consider();
      continue;
    }
    if (char === "&") {
      const end = value.indexOf(";", index + 1);
      if (end === -1 || end - index > 16 || end >= room) break;
      index = end + 1;
      consider();
      continue;
    }
    index += 1;
    consider();
  }

  return value.slice(0, bestIndex) + bestClosers + fallback;
}

export function capResendTemplateVariables(
  variables: Record<string, string>,
  context: { template?: string; orderNumber?: string } = {},
): Record<string, string> {
  const capped: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    if (value.length <= RESEND_TEMPLATE_VARIABLE_LIMIT) {
      capped[key] = value;
      continue;
    }
    const shortened = truncateResendTemplateValue(value);
    console.warn("[email] Shortened a template variable that was over 2000 characters:", {
      key,
      length: value.length,
      shortenedTo: shortened.length,
      template: context.template,
      orderNumber: context.orderNumber,
    });
    capped[key] = shortened;
  }
  return capped;
}
