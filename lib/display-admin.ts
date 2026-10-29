import {
  isDisplayOnline,
  publicPayloadForDisplay,
  storedDisplayTheme,
  sanitizeCustomMessage,
  type DisplayResolveInput,
  type DisplayRow,
} from "@/lib/display";
import type { StudioCalendarStatus } from "@/lib/studio-calendar-config";
import { resolveOpenSignMode, type OpenSignMode } from "@/lib/shop-hours";
import { studioCheckoutLinesFromRow, studioInfoLinesFromRow } from "@/lib/studio-info";

export interface AdminDisplay {
  slug: string;
  name: string;
  location: string | null;
  orientation: string;
  resolution: string | null;
  /** Resolved payload theme (crt-green, airport, or a chrome theme). */
  theme: string;
  /** Theme stored on the row. Light or high contrast. */
  chromeTheme: string;
  defaultMode: string;
  resolvedMode: string;
  isEnabled: boolean;
  lastSeen: string | null;
  online: boolean;
  overrideMessage: string | null;
  refreshSeconds: number;
  showStudioBookings: boolean;
  showOpenSign: boolean;
  /** Front window control. Other screens stay off and do not show the control. */
  openSignMode: OpenSignMode;
  studioInfoLines: string[];
  studioCheckoutLines: string[];
}

export interface DisplaysAdminResponse {
  displays: AdminDisplay[];
  calendar: StudioCalendarStatus;
}

export function toAdminDisplay(
  row: DisplayRow,
  now = Date.now(),
  extras?: Omit<DisplayResolveInput, "display">,
): AdminDisplay {
  const payload = publicPayloadForDisplay(row, extras);
  const overrideMessage = row.override_mode === "custom_message"
    ? sanitizeCustomMessage(
      row.override_payload && typeof row.override_payload === "object"
        ? (row.override_payload as { message?: unknown }).message
        : null,
    ) || null
    : null;

  return {
    slug: row.slug,
    name: row.name,
    location: row.location,
    orientation: row.orientation,
    resolution: row.resolution,
    theme: payload.theme,
    chromeTheme: storedDisplayTheme(row.theme),
    defaultMode: row.mode,
    resolvedMode: payload.mode,
    isEnabled: row.is_enabled,
    lastSeen: row.last_seen,
    online: isDisplayOnline(row.last_seen, now),
    overrideMessage,
    refreshSeconds: payload.refreshSeconds,
    showStudioBookings: row.show_studio_bookings !== false,
    showOpenSign: row.show_open_sign === true,
    openSignMode: resolveOpenSignMode({
      slug: row.slug,
      openSignMode: row.open_sign_mode,
      openSignUntil: row.open_sign_until,
      legacyEnabled: row.show_open_sign === true,
      now: new Date(now),
    }),
    studioInfoLines: studioInfoLinesFromRow(row.studio_info_lines),
    studioCheckoutLines: studioCheckoutLinesFromRow(row.studio_checkout_lines),
  };
}
