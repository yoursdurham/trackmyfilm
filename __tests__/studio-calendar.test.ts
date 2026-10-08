import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicPayloadForDisplay, type DisplayResolveInput } from "@/lib/display";
import {
  bookingsFromIcs,
  classifyStudioBookings,
  nyWallTimeToUtc,
  summarizeStudioBookings,
} from "@/lib/studio-calendar";
import { clearStudioCalendarCache, getCachedStudioAgenda } from "@/lib/studio-calendar-cache";

const bookingsIcs = readFileSync(resolve(__dirname, "fixtures/studio-bookings.ics"), "utf8");
const edgeIcs = readFileSync(resolve(__dirname, "fixtures/studio-calendar-edge.ics"), "utf8");

const PRIVATE = /919-555-0148|919-555-0199|919-555-0177|919-555-0101|919-555-0133|faith\.oates@example\.com|casey@example\.com|morgan@example\.com|\$150\.00|\$80|4821|gravel lot|silver umbrella|DESCRIPTION/i;

function at(hour: number, minute: number, second = 0, day = 8) {
  return nyWallTimeToUtc(2026, 10, day, hour, minute, second);
}

const screen: DisplayResolveInput["display"] = {
  mode: "film_stats",
  theme: "yours-clean",
  is_enabled: true,
  override_mode: null,
  override_payload: null,
  studio_info_lines: ["Wi-Fi: ExampleNet, password example123"],
  studio_checkout_lines: [
    "Please put furniture back where it was",
    "Press the lock on the door on your way out.",
  ],
};

function payloadAt(when: Date, display: typeof screen = screen) {
  const bookings = bookingsFromIcs(bookingsIcs, when);
  return publicPayloadForDisplay(display, {
    studio: classifyStudioBookings(bookings, when),
    film: { rollsProcessing: 4 },
  });
}

describe("studio booking parse", () => {
  const now = at(13, 0);

  it("keeps Acuity titles, first names, and one copy of a duplicated booking", () => {
    expect(bookingsIcs).toMatch(/919-555-0148/);
    expect(bookingsIcs).toMatch(/faith\.oates@example\.com/);
    expect(bookingsIcs).toMatch(/\$150\.00/);
    expect(bookingsIcs).toMatch(/Door code: 4821/);
    expect(bookingsIcs).toMatch(/gravel lot/);

    const bookings = bookingsFromIcs(bookingsIcs, now);
    expect(bookings.map((booking) => [booking.firstName, booking.sessionType])).toEqual([
      ["Faith", "1 Hour Session"],
      ["Quinn", "Mini Session"],
      ["Jacob", "Headshot Session"],
      ["Hyunjung", "Passport Photos"],
    ]);
    expect(bookings.filter((booking) => booking.firstName === "Faith")).toHaveLength(1);
    for (const booking of bookings) {
      expect(Object.keys(booking).sort()).toEqual(["end", "firstName", "sessionType", "start"]);
    }
    expect(JSON.stringify(bookings)).not.toMatch(PRIVATE);
    expect(bookings[0]?.start.toISOString()).toBe("2026-10-08T18:00:00.000Z");
    expect(bookings[0]?.end.toISOString()).toBe("2026-10-08T19:00:00.000Z");
  });

  it("keeps the later end when the same title and start are duplicated", () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:one@example.com
DTSTART;TZID=America/New_York:20261008T140000
DTEND;TZID=America/New_York:20261008T150000
SUMMARY:Faith Oates: 1 Hour Session (Yours, Studio)
END:VEVENT
BEGIN:VEVENT
UID:two@example.com
DTSTART;TZID=America/New_York:20261008T140000
DTEND;TZID=America/New_York:20261008T153000
SUMMARY:Faith Oates: 1 Hour Session (Yours, Studio)
END:VEVENT
END:VCALENDAR`;
    const bookings = bookingsFromIcs(ics, now);
    expect(bookings).toHaveLength(1);
    expect(bookings[0]?.end.toISOString()).toBe("2026-10-08T19:30:00.000Z");
  });

  it("counts bookings left today and the next start without names", () => {
    const midday = summarizeStudioBookings(bookingsFromIcs(bookingsIcs, at(13, 0)), at(13, 0));
    expect(midday).toEqual({ bookingsLeftToday: 3, nextBookingStart: "2:00 PM" });
    const evening = summarizeStudioBookings(bookingsFromIcs(bookingsIcs, at(17, 0)), at(17, 0));
    expect(evening).toEqual({ bookingsLeftToday: 0, nextBookingStart: "Tomorrow 10:00 AM" });
    expect(JSON.stringify(evening)).not.toMatch(/Hyunjung|Faith/);
  });
});

describe("studio calendar edge cases", () => {
  it("drops a cancelled override, honors EXDATE, and keeps the next occurrence", () => {
    const today = bookingsFromIcs(edgeIcs, at(12, 0));
    const names = today.map((booking) => `${booking.firstName}@${booking.start.toISOString()}`);
    expect(names).not.toContain("Riley@2026-10-08T16:00:00.000Z");
    expect(names).not.toContain("Casey@2026-10-08T20:00:00.000Z");
    expect(names).toContain("Casey@2026-10-09T20:00:00.000Z");
    expect(JSON.stringify(today)).not.toMatch(PRIVATE);

    const nextThursday = bookingsFromIcs(edgeIcs, at(12, 0, 0, 15));
    expect(nextThursday.some((booking) => booking.firstName === "Riley")).toBe(true);
  });

  it("reads all-day dates, floating studio times, and zulu times", () => {
    const bookings = bookingsFromIcs(edgeIcs, at(12, 0));
    const sam = bookings.find((booking) => booking.firstName === "Sam");
    const avery = bookings.find((booking) => booking.firstName === "Avery");
    const noah = bookings.find((booking) => booking.firstName === "Noah");
    expect(sam?.start.toISOString()).toBe("2026-10-09T04:00:00.000Z");
    expect(sam?.end.toISOString()).toBe("2026-10-10T04:00:00.000Z");
    expect(avery?.start.toISOString()).toBe("2026-10-08T13:00:00.000Z");
    expect(avery?.end.toISOString()).toBe("2026-10-08T14:00:00.000Z");
    expect(noah?.start.toISOString()).toBe("2026-10-08T20:00:00.000Z");
    expect(bookings.some((booking) => booking.sessionType === "Inventory day")).toBe(false);
  });
});

describe("studio window boundaries", () => {
  const cases: [string, number, number, number, string, string][] = [
    ["before the hour", 12, 59, 59, "film_stats", ""],
    ["at 60 minutes", 13, 0, 0, "studio_upcoming", "Faith"],
    ["just before welcome", 13, 44, 59, "studio_upcoming", "Faith"],
    ["at 15 minutes", 13, 45, 0, "studio_welcome", "Faith"],
    ["just before the start", 13, 59, 59, "studio_welcome", "Faith"],
    ["at the start", 14, 0, 0, "studio_active", "Faith"],
    ["just before ending soon", 14, 49, 59, "studio_active", "Faith"],
    ["at 10 minutes left, ahead of the next welcome", 14, 50, 0, "studio_ending_soon", "Faith"],
    ["through the last minute", 14, 59, 59, "studio_ending_soon", "Faith"],
    ["at the end, the next session is welcome", 15, 0, 0, "studio_welcome", "Quinn"],
    ["at the next start", 15, 5, 0, "studio_active", "Quinn"],
    ["after the last session", 16, 30, 0, "film_stats", ""],
  ];

  it.each(cases)("%s", (_label, hour, minute, second, mode, firstName) => {
    const payload = payloadAt(at(hour, minute, second));
    expect(payload.mode).toBe(mode);
    if (firstName) expect(payload.data.firstName).toBe(firstName);
    if (mode === "studio_welcome" || mode === "studio_active") {
      expect(payload.data.infoLines).toEqual(["Wi-Fi: ExampleNet, password example123"]);
      expect(payload.data).not.toHaveProperty("checkoutLines");
    } else if (mode === "studio_ending_soon") {
      expect(payload.data.checkoutLines).toEqual([
        "Please put furniture back where it was",
        "Press the lock on the door on your way out.",
      ]);
      expect(payload.data).not.toHaveProperty("infoLines");
    } else {
      expect(payload.data).not.toHaveProperty("infoLines");
      expect(payload.data).not.toHaveProperty("checkoutLines");
    }
    expect(JSON.stringify(payload)).not.toMatch(PRIVATE);
  });

  it("lets a custom message beat a welcome window", () => {
    const payload = payloadAt(at(13, 45), {
      ...screen,
      override_mode: "custom_message",
      override_payload: { message: "Back in a minute" },
    });
    expect(payload).toMatchObject({ mode: "custom_message", data: { message: "Back in a minute" } });
    expect(JSON.stringify(payload)).not.toMatch(/Faith|example123|919/);
  });
});

describe("studio calendar cache", () => {
  const secretUrl = "https://calendar.google.com/calendar/ical/secret-token/basic.ics";

  beforeEach(() => {
    clearStudioCalendarCache();
    delete process.env.STUDIO_CALENDAR_ICS_URL;
    vi.useFakeTimers();
    vi.setSystemTime(at(13, 45));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.STUDIO_CALENDAR_ICS_URL;
    clearStudioCalendarCache();
  });

  it("does not fetch or connect when the address is unset", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const agenda = await getCachedStudioAgenda(at(13, 45));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(agenda.status).toEqual({
      configured: false,
      connected: false,
      bookingsLeftToday: null,
      nextBookingStart: null,
    });
    expect(agenda.input).toBeNull();
    expect(agenda.bookings).toEqual([]);
  });

  it("caches a good parse and keeps it when the next fetch fails", async () => {
    process.env.STUDIO_CALENDAR_ICS_URL = secretUrl;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(bookingsIcs, { status: 200 }))
      .mockRejectedValueOnce(new Error(`network down ${secretUrl}`));
    vi.stubGlobal("fetch", fetchMock);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const first = await getCachedStudioAgenda(at(13, 45));
    expect(first.status.connected).toBe(true);
    expect(first.status.bookingsLeftToday).toBe(3);
    expect(first.status.nextBookingStart).toBe("2:00 PM");
    expect(first.input?.welcome?.firstName).toBe("Faith");
    expect(JSON.stringify(first)).not.toMatch(PRIVATE);
    expect(JSON.stringify(first.status)).not.toMatch(/Faith|Quinn|Jacob/);

    const cached = await getCachedStudioAgenda(at(13, 46));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cached.input?.welcome?.firstName).toBe("Faith");

    vi.setSystemTime(new Date(at(13, 45).getTime() + 61_000));
    const stale = await getCachedStudioAgenda(at(13, 50));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stale.status.connected).toBe(false);
    expect(stale.status.configured).toBe(true);
    expect(stale.input?.welcome?.firstName).toBe("Faith");
    expect(spy.mock.calls.flat().join(" ")).not.toContain("secret-token");
    expect(spy.mock.calls.flat().join(" ")).not.toContain(secretUrl);
  });
});
