import {
  isDisplayOnline,
  publicPayloadForDisplay,
  sanitizeCustomMessage,
  type DisplayRow,
} from "@/lib/display";

export interface AdminDisplay {
  slug: string;
  name: string;
  location: string | null;
  orientation: string;
  resolution: string | null;
  theme: string;
  defaultMode: string;
  resolvedMode: string;
  isEnabled: boolean;
  lastSeen: string | null;
  online: boolean;
  overrideMessage: string | null;
  refreshSeconds: number;
}

export function toAdminDisplay(row: DisplayRow, now = Date.now()): AdminDisplay {
  const payload = publicPayloadForDisplay(row);
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
    defaultMode: row.mode,
    resolvedMode: payload.mode,
    isEnabled: row.is_enabled,
    lastSeen: row.last_seen,
    online: isDisplayOnline(row.last_seen, now),
    overrideMessage,
    refreshSeconds: payload.refreshSeconds,
  };
}
