import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mockRequireAuth = vi.fn();
const mockListDisplays = vi.fn();
const mockGetCachedStudioAgenda = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock("@/lib/db", () => ({
  listDisplays: (...args: unknown[]) => mockListDisplays(...args),
}));

vi.mock("@/lib/studio-calendar-cache", () => ({
  getCachedStudioAgenda: (...args: unknown[]) => mockGetCachedStudioAgenda(...args),
}));

import { GET } from "@/app/api/displays/route";

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
  last_seen: null,
  last_client: null,
  override_mode: null,
  override_payload: null,
  show_studio_bookings: true,
  studio_info_lines: ["Wi-Fi: Trinity Design Build 5G, password Trinity64"],
  studio_checkout_lines: ["Press the lock on the door on your way out."],
};

describe("GET /api/displays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: "user-1" });
    mockListDisplays.mockResolvedValue([row]);
    mockGetCachedStudioAgenda.mockResolvedValue({
      bookings: [{
        firstName: "Faith",
        sessionType: "1 Hour Session",
        start: new Date("2026-10-08T18:00:00.000Z"),
        end: new Date("2026-10-08T19:00:00.000Z"),
      }],
      input: {
        welcome: {
          firstName: "Faith",
          sessionType: "1 Hour Session",
          start: "2:00 PM",
          end: "3:00 PM",
          email: "faith.oates@example.com",
        },
      },
      status: {
        configured: true,
        connected: true,
        bookingsLeftToday: 2,
        nextBookingStart: "2:00 PM",
      },
    });
  });

  it("requires a staff session", async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mockListDisplays).not.toHaveBeenCalled();
  });

  it("returns the toggle, the lines, and calendar status without guest names", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.calendar).toEqual({
      configured: true,
      connected: true,
      bookingsLeftToday: 2,
      nextBookingStart: "2:00 PM",
    });
    expect(body.displays[0]).toMatchObject({
      slug: "studio-vertical",
      showStudioBookings: true,
      resolvedMode: "studio_welcome",
      studioInfoLines: ["Wi-Fi: Trinity Design Build 5G, password Trinity64"],
      studioCheckoutLines: ["Press the lock on the door on your way out."],
    });
    expect(JSON.stringify(body)).not.toMatch(/Faith|faith\.oates|sessionType/);
  });
});
