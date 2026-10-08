import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequireAuth = vi.fn();
const mockGetDisplayBySlug = vi.fn();
const mockUpdateDisplay = vi.fn();
const mockGetCachedFilmMetrics = vi.fn();

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

import { GET, PATCH } from "@/app/api/displays/[slug]/route";

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
    mockGetDisplayBySlug.mockResolvedValue(row);
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
      theme: "yours-clean",
      refreshSeconds: 30,
      data: { message: "Quiet hour" },
    });
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("last_seen");
    expect(body).not.toHaveProperty("override_payload");
    expect(body).not.toHaveProperty("customer_email");
    expect(JSON.stringify(body)).not.toMatch(/guest@|919|do not print/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mockGetCachedFilmMetrics).not.toHaveBeenCalled();
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
