import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const clock = vi.hoisted(() => ({ now: new Date("2026-10-08T19:00:00.000Z") }));

vi.mock("@/lib/display-clock", () => ({
  displayNow: () => clock.now,
}));

const mockRequireAuth = vi.fn();
const mockGetDisplayBySlug = vi.fn();
const mockUpdateDisplay = vi.fn();
const mockGetCachedFilmMetrics = vi.fn();
const mockGetCachedFilmMenu = vi.fn();
const mockGetCachedFilmDepartures = vi.fn();
const mockGetCachedStudioAgenda = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock("@/lib/db", () => ({
  getDisplayBySlug: (...args: unknown[]) => mockGetDisplayBySlug(...args),
  updateDisplay: (...args: unknown[]) => mockUpdateDisplay(...args),
}));

vi.mock("@/lib/film-metrics-cache", () => ({
  getCachedFilmMetrics: (...args: unknown[]) => mockGetCachedFilmMetrics(...args),
}));

vi.mock("@/lib/film-menu-cache", () => ({
  getCachedFilmMenu: (...args: unknown[]) => mockGetCachedFilmMenu(...args),
  clearFilmMenuCache: () => {},
}));

vi.mock("@/lib/film-departures-cache", () => ({
  getCachedFilmDepartures: (...args: unknown[]) => mockGetCachedFilmDepartures(...args),
  clearFilmDeparturesCache: () => {},
}));

vi.mock("@/lib/studio-calendar-cache", () => ({
  getCachedStudioAgenda: (...args: unknown[]) => mockGetCachedStudioAgenda(...args),
}));

import { GET, PATCH } from "@/app/api/displays/[slug]/route";
import { displayBuildId } from "@/lib/display";

const row = {
  id: "display-1",
  slug: "studio-vertical",
  name: "Studio Vertical",
  location: "Studio",
  orientation: "portrait",
  resolution: "1080x3840",
  mode: "idle",
  playlist_id: null,
  theme: "yours-clean",
  is_enabled: true,
  last_seen: "2026-10-08T15:59:00.000Z",
  last_client: { userAgent: "Pi" },
  override_mode: "custom_message",
  override_payload: {
    message: "Quiet hour",
    email: "guest@example.com",
    phone: "919-555-0199",
    private_notes: "do not print",
  },
  customer_email: "guest@example.com",
};

describe("GET /api/displays/:slug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clock.now = new Date("2026-10-08T19:00:00.000Z");
    mockGetDisplayBySlug.mockResolvedValue(row);
    mockGetCachedStudioAgenda.mockResolvedValue({
      bookings: [],
      input: null,
      status: {
        configured: false,
        connected: false,
        bookingsLeftToday: null,
        nextBookingStart: null,
      },
    });
  });

  function get(slug = "studio-vertical") {
    return GET(new Request(`http://localhost/api/displays/${slug}`), {
      params: Promise.resolve({ slug }),
    });
  }

  it("returns only the whitelisted payload", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      mode: "custom_message",
      theme: "crt-green",
      refreshSeconds: 30,
      buildId: displayBuildId(),
      data: { message: "Quiet hour" },
    });
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("last_seen");
    expect(body).not.toHaveProperty("override_payload");
    expect(body).not.toHaveProperty("customer_email");
    expect(JSON.stringify(body)).not.toMatch(/guest@|919|do not print/);
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=60, stale-while-revalidate=60");
    expect(mockGetCachedFilmMetrics).not.toHaveBeenCalled();
    expect(mockGetCachedFilmDepartures).not.toHaveBeenCalled();
  });

  it("returns whitelisted film stats and never the customer fields on the metrics row", async () => {
    mockGetDisplayBySlug.mockResolvedValue({
      ...row,
      mode: "film_stats",
      override_mode: null,
      override_payload: null,
    });
    mockGetCachedFilmMetrics.mockResolvedValue({
      rollsProcessing: 12,
      receivedToday: 3,
      receivedThisWeek: 9,
      scansSentToday: 2,
      scansSentThisWeek: 7,
      averageColorTurnaroundDays: 4.5,
      averageBwTurnaroundDays: null,
      nextLabRun: "Today 12:00 PM",
      customer_email: "secret@example.com",
      customer_name: "Ada Lovelace",
      revenue: 40,
    });

    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      mode: "film_stats",
      theme: "yours-clean",
      refreshSeconds: 30,
      buildId: displayBuildId(),
      data: {
        rollsProcessing: 12,
        receivedToday: 3,
        receivedThisWeek: 9,
        scansSentToday: 2,
        scansSentThisWeek: 7,
        averageColorTurnaroundDays: 4.5,
        averageBwTurnaroundDays: null,
        nextLabRun: "Today 12:00 PM",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/secret@|Ada|revenue/);
    expect(mockGetCachedFilmMenu).not.toHaveBeenCalled();
  });

  it("returns only the film menu when that mode is selected", async () => {
    mockGetDisplayBySlug.mockResolvedValue({
      ...row,
      mode: "film_menu",
      override_mode: null,
      override_payload: null,
    });
    mockGetCachedFilmMenu.mockResolvedValue({
      title: "YOUR'S FILM MENU",
      subtitle: "Durham, North Carolina",
      banner: ["PRICES SUBJECT TO CHANGE"],
      sections: [{
        title: "35MM FILM",
        items: [
          { name: "Expired 35mm/120 Roll", price: "$7" },
          { name: "Kodak Gold 200 - 35mm", price: "$12" },
        ],
      }],
      notes: [{ text: "Please rewind your film." }],
      customer_email: "secret@example.com",
    });

    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.theme).toBe("crt-green");
    expect(body.mode).toBe("film_menu");
    expect(body.data).toEqual({
      menu: {
        title: "YOUR'S FILM MENU",
        subtitle: "Durham, North Carolina",
        banner: ["PRICES SUBJECT TO CHANGE"],
        sections: [{
          title: "35MM FILM",
          items: [
            { name: "Expired 35mm/120 Roll", price: "$7" },
            { name: "Kodak Gold 200 - 35mm", price: "$12" },
          ],
        }],
        notes: [{ text: "Please rewind your film." }],
      },
    });
    expect(mockGetCachedFilmMetrics).not.toHaveBeenCalled();
    expect(mockGetCachedFilmDepartures).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toMatch(/secret@|guest@/);
  });

  it("returns a public departures board and never a full name, email, phone, or order number", async () => {
    mockGetDisplayBySlug.mockResolvedValue({
      ...row,
      mode: "film_departures",
      override_mode: null,
      override_payload: null,
      show_studio_bookings: false,
    });
    mockGetCachedFilmDepartures.mockResolvedValue({
      departures: [],
      arrivals: [{
        from: "LAB",
        name: "Justin Edwards",
        rolls: 3,
        expected: "OCT 13",
        status: "IN FLIGHT",
        email: "justin.edwards@example.com",
        phone: "919-555-0100",
        order_number: "TMF1042",
      }],
      people: 1,
      studioRolls: 0,
      labRolls: 3,
      landedRolls: 0,
      nextLabRun: "FRI 12:00 PM",
      departureTime: "12:00",
      customer_email: "secret@example.com",
    });

    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.theme).toBe("airport");
    expect(body.mode).toBe("film_departures");
    expect(body.data).toEqual({
      departures: {
        departures: [],
        arrivals: [{ from: "LAB", name: "JUSTIN E.", rolls: 3, expected: "OCT 13", status: "IN FLIGHT" }],
        people: 1,
        studioRolls: 0,
        labRolls: 3,
        landedRolls: 0,
        nextLabRun: "FRI 12:00 PM",
        departureTime: "12:00",
      },
    });
    expect(mockGetCachedFilmMetrics).not.toHaveBeenCalled();
    expect(mockGetCachedFilmMenu).not.toHaveBeenCalled();
    expect(mockGetCachedStudioAgenda).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toMatch(/Edwards|example\.com|919|TMF|secret@/);
  });

  it("lets a studio welcome replace film departures without leaking the board", async () => {
    mockGetDisplayBySlug.mockResolvedValue({
      ...row,
      mode: "film_departures",
      override_mode: null,
      override_payload: null,
      show_studio_bookings: true,
    });
    mockGetCachedFilmDepartures.mockResolvedValue({
      rows: [{ name: "JUSTIN E.", rolls: 2, location: "STUDIO", status: "CHECKED IN", since: "OCT 8" }],
      people: 1,
      studioRolls: 2,
      labRolls: 0,
      nextLabRun: "Friday 12:00 PM",
    });
    mockGetCachedStudioAgenda.mockResolvedValue({
      bookings: [],
      input: {
        welcome: {
          firstName: "Faith",
          sessionType: "1 Hour Session",
          start: "2:00 PM",
          end: "3:00 PM",
          email: "faith.oates@example.com",
        },
      },
      status: { configured: true, connected: true, bookingsLeftToday: 1, nextBookingStart: "2:00 PM" },
    });

    const response = await get();
    const body = await response.json();
    expect(body.mode).toBe("studio_welcome");
    expect(body.data.firstName).toBe("Faith");
    expect(body.data).not.toHaveProperty("departures");
    expect(JSON.stringify(body)).not.toMatch(/JUSTIN|faith\.oates|Friday/);
  });

  it("returns the welcome state with studio info and without calendar secrets", async () => {
    mockGetDisplayBySlug.mockResolvedValue({
      ...row,
      mode: "film_stats",
      override_mode: null,
      override_payload: null,
      show_studio_bookings: true,
      studio_info_lines: ["Wi-Fi: ExampleNet, password example123"],
      studio_checkout_lines: ["Press the lock on the door on your way out."],
    });
    mockGetCachedStudioAgenda.mockResolvedValue({
      bookings: [],
      input: {
        welcome: {
          firstName: "Faith",
          sessionType: "1 Hour Session",
          start: "2:00 PM",
          end: "3:00 PM",
          email: "faith.oates@example.com",
          phone: "919-555-0148",
          price: "$150.00",
          description: "Door code: 4821. Parking: the gravel lot behind the bakery.",
        },
      },
      status: { configured: true, connected: true, bookingsLeftToday: 2, nextBookingStart: "2:00 PM" },
    });

    const response = await get();
    const body = await response.json();
    expect(body.mode).toBe("studio_welcome");
    expect(body.data).toEqual({
      firstName: "Faith",
      sessionType: "1 Hour Session",
      start: "2:00 PM",
      end: "3:00 PM",
      infoLines: ["Wi-Fi: ExampleNet, password example123"],
    });
    expect(body.data).not.toHaveProperty("checkoutLines");
    expect(body).not.toHaveProperty("calendar");
    expect(JSON.stringify(body)).not.toMatch(/faith\.oates|919-555-0148|150\.00|4821|gravel|bookingsLeftToday/);
  });

  it("does not ask the calendar when studio bookings are off", async () => {
    mockGetDisplayBySlug.mockResolvedValue({
      ...row,
      mode: "film_stats",
      override_mode: null,
      override_payload: null,
      show_studio_bookings: false,
    });
    mockGetCachedFilmMetrics.mockResolvedValue({ rollsProcessing: 1, nextLabRun: "Friday 12:00 PM" });
    const response = await get();
    const body = await response.json();
    expect(body.mode).toBe("film_stats");
    expect(mockGetCachedStudioAgenda).not.toHaveBeenCalled();
  });

  it("keeps staff preview and signed-in browsers off the shared cache", async () => {
    const preview = await GET(new Request("http://localhost/api/displays/studio-vertical?preview=1"), {
      params: Promise.resolve({ slug: "studio-vertical" }),
    });
    expect(preview.headers.get("cache-control")).toBe("private, no-store");

    const signedIn = await GET(new Request("http://localhost/api/displays/studio-vertical", {
      headers: { cookie: "sb-example-auth-token=abc" },
    }), {
      params: Promise.resolve({ slug: "studio-vertical" }),
    });
    expect(signedIn.headers.get("cache-control")).toBe("private, no-store");
  });

  it("slows overnight polls unless a booking is soon", async () => {
    clock.now = new Date("2026-10-09T02:30:00.000Z");
    mockGetDisplayBySlug.mockResolvedValue({
      ...row,
      mode: "idle",
      override_mode: null,
      override_payload: null,
      refresh_seconds: 30,
    });
    mockGetCachedStudioAgenda.mockResolvedValue({
      bookings: [],
      input: null,
      status: { configured: true, connected: true, bookingsLeftToday: 0, nextBookingStart: null },
    });
    const quiet = await get();
    expect((await quiet.json()).refreshSeconds).toBe(300);

    mockGetCachedStudioAgenda.mockResolvedValue({
      bookings: [{
        firstName: "Ada",
        sessionType: "Studio",
        start: new Date(clock.now.getTime() + 20 * 60 * 1000),
        end: new Date(clock.now.getTime() + 80 * 60 * 1000),
      }],
      input: null,
      status: { configured: true, connected: true, bookingsLeftToday: 1, nextBookingStart: "10:50 PM" },
    });
    const soon = await get();
    expect((await soon.json()).refreshSeconds).toBe(30);
  });

  it("does not look up a malformed slug", async () => {
    const response = await get("../film_orders");
    expect(response.status).toBe(404);
    expect(mockGetDisplayBySlug).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/displays/:slug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: "user-1" });
    mockUpdateDisplay.mockImplementation(async (_slug: string, patch: Record<string, unknown>) => ({
      ...row,
      ...patch,
      override_mode: patch.override_mode ?? null,
      override_payload: patch.override_payload ?? null,
    }));
  });

  function patch(body: unknown) {
    return PATCH(new Request("http://localhost/api/displays/studio-vertical", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }), {
      params: Promise.resolve({ slug: "studio-vertical" }),
    });
  }

  it("requires a staff session", async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    const response = await patch({ mode: "idle" });
    expect(response.status).toBe(401);
    expect(mockUpdateDisplay).not.toHaveBeenCalled();
  });

  it("stores a sanitized custom message and returns the admin view", async () => {
    const response = await patch({ overrideMessage: "Hello <img src=x> studio" });
    expect(response.status).toBe(200);
    expect(mockUpdateDisplay).toHaveBeenCalledWith("studio-vertical", {
      override_mode: "custom_message",
      override_payload: { message: "Hello  studio" },
    });
    const body = await response.json();
    expect(body.resolvedMode).toBe("custom_message");
    expect(body.overrideMessage).toBe("Hello  studio");
    expect(body.email).toBeUndefined();
  });

  it("accepts film departures as a default mode", async () => {
    mockUpdateDisplay.mockImplementation(async () => ({
      ...row,
      mode: "film_departures",
      override_mode: null,
      override_payload: null,
    }));
    const response = await patch({ mode: "film_departures" });
    expect(response.status).toBe(200);
    expect(mockUpdateDisplay).toHaveBeenCalledWith("studio-vertical", { mode: "film_departures" });
    const body = await response.json();
    expect(body.defaultMode).toBe("film_departures");
    expect(body.resolvedMode).toBe("film_departures");
    expect(body.theme).toBe("airport");
  });

  it("accepts film stats as a default mode", async () => {
    mockUpdateDisplay.mockImplementation(async () => ({
      ...row,
      mode: "film_stats",
      override_mode: null,
      override_payload: null,
    }));
    const response = await patch({ mode: "film_stats" });
    expect(response.status).toBe(200);
    expect(mockUpdateDisplay).toHaveBeenCalledWith("studio-vertical", { mode: "film_stats" });
    const body = await response.json();
    expect(body.defaultMode).toBe("film_stats");
    expect(body.resolvedMode).toBe("film_stats");
    expect(body.customer_email).toBeUndefined();
  });

  it("stores the bookings switch and the guest lines", async () => {
    mockUpdateDisplay.mockImplementation(async (_slug: string, patch: Record<string, unknown>) => ({
      ...row,
      override_mode: null,
      override_payload: null,
      ...patch,
    }));
    const response = await patch({
      showStudioBookings: false,
      studioInfoLines: ["  Wi-Fi: Guest  ", "<b>Bathrooms</b> left"],
      studioCheckoutLines: ["Put the furniture back"],
    });
    expect(response.status).toBe(200);
    expect(mockUpdateDisplay).toHaveBeenCalledWith("studio-vertical", {
      show_studio_bookings: false,
      studio_info_lines: ["Wi-Fi: Guest", "Bathrooms left"],
      studio_checkout_lines: ["Put the furniture back"],
    });
    const body = await response.json();
    expect(body.showStudioBookings).toBe(false);
    expect(body.studioInfoLines).toEqual(["Wi-Fi: Guest", "Bathrooms left"]);
    expect(body.customer_email).toBeUndefined();
  });

  it("rejects a studio info value that is not a list", async () => {
    const response = await patch({ studioInfoLines: "Wi-Fi" });
    expect(response.status).toBe(400);
    expect(mockUpdateDisplay).not.toHaveBeenCalled();
  });

  it("clears the override", async () => {
    mockUpdateDisplay.mockImplementation(async () => ({
      ...row,
      override_mode: null,
      override_payload: null,
    }));
    const response = await patch({ clearOverride: true });
    expect(response.status).toBe(200);
    expect(mockUpdateDisplay).toHaveBeenCalledWith("studio-vertical", {
      override_mode: null,
      override_payload: null,
    });
    const body = await response.json();
    expect(body.resolvedMode).toBe("idle");
    expect(body.overrideMessage).toBeNull();
  });
});
