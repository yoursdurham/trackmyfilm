/**
 * At most one Supabase heartbeat write per screen inside this window.
 * Kiosks post on this same interval. The Displays page treats a screen as
 * online for two intervals, so one missed post does not flip it offline.
 */
export const HEARTBEAT_WRITE_INTERVAL_MS = 45 * 60 * 1000;

const lastWrite = new Map<string, number>();

export function clearDisplayHeartbeatThrottle(): void {
  lastWrite.clear();
}

/** False when this process already recorded the slug inside the window. */
export function heartbeatWriteDue(slug: string, now = Date.now()): boolean {
  const previous = lastWrite.get(slug);
  return previous === undefined || now - previous >= HEARTBEAT_WRITE_INTERVAL_MS;
}

/** True when the row itself has not checked in inside the window. */
export function heartbeatDueFromSeen(lastSeen: string | null | undefined, now = Date.now()): boolean {
  if (!lastSeen) return true;
  const time = new Date(lastSeen).getTime();
  if (!Number.isFinite(time)) return true;
  return now - time >= HEARTBEAT_WRITE_INTERVAL_MS;
}

export function rememberHeartbeatWrite(slug: string, now = Date.now()): void {
  lastWrite.set(slug, now);
}
