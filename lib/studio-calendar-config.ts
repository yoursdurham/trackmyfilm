/**
 * Studio booking rules. Edit this file when the Acuity title format or the
 * on-screen timing windows change. No secrets live here.
 *
 * Windows, compared with the session start and end:
 *   upcoming     from 60 minutes before start until the welcome window
 *   welcome      from 15 minutes before start until the start
 *   active       from the start until the ending-soon window
 *   ending soon  from 10 minutes before the end until the end
 * At the end instant the session is gone. The start instant is active.
 */

export const STUDIO_TIME_ZONE = "America/New_York";

/**
 * Acuity bookings synced onto the studio Google Calendar.
 * Example: "Faith Oates: 1 Hour Session (Yours, Studio)"
 */
export const ACUITY_BOOKING_TITLE =
  /^(.+?):\s*(.+?)\s*\(\s*Yours\s*,\s*Studio\s*\)\s*$/i;

export const STUDIO_WINDOWS = {
  upcomingMinutes: 60,
  welcomeMinutes: 15,
  endingSoonMinutes: 10,
} as const;

/** Long enough that the 30-second display poll does not refetch the calendar. */
export const STUDIO_CALENDAR_CACHE_MS = 60_000;

export interface StudioCalendarStatus {
  configured: boolean;
  connected: boolean;
  bookingsLeftToday: number | null;
  nextBookingStart: string | null;
}
