/** At most one Supabase heartbeat write per screen inside this window. */
export const HEARTBEAT_WRITE_INTERVAL_MS = 5 * 60 * 1000;

const lastWrite = new Map<string, number>();

export function clearDisplayHeartbeatThrottle(): void {
  lastWrite.clear();
}

/** False when this process already recorded the slug inside the window. */
export function heartbeatWriteDue(slug: string, now = Date.now()): boolean {
  const previous = lastWrite.get(slug);
  return previous === undefined || now - previous >= HEARTBEAT_WRITE_INTERVAL_MS;
}

export function rememberHeartbeatWrite(slug: string, now = Date.now()): void {
  lastWrite.set(slug, now);
}
