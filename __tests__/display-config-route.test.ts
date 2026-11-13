import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDisplayBySlug = vi.fn();
const mockTouch = vi.fn();

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => fn(...args),
  revalidateTag: () => {},
}));

vi.mock("@/lib/db", () => ({
  getDisplayBySlug: (...args: unknown[]) => mockGetDisplayBySlug(...args),
  touchDisplayHeartbeat: (...args: unknown[]) => mockTouch(...args),
  getFilmMenuUpdatedAt: () => Promise.resolve("2026-10-01T15:00:00.000Z"),
}));

vi.mock("@/lib/film-metrics-cache", () => ({
  getCachedFilmMetrics: () => {
    throw new Error("config must not load film stats");
  },
}));

vi.mock("@/lib/film-menu-cache", () => ({
  getCachedFilmMenu: () => {
    throw new Error("config must not load the film menu");
  },
}));

import { GET } from "@/app/api/displays/[slug]/config/route";
import { displayBuildId } from "@/lib/display";

const row = {
  id: "display-1",
  slug: "front-window",
  name: "Front Window",
  location: "Window",
  orientation: "landscape",
  resolution: "1920x1080",
  mode: "film_menu",
  playlist_id: null,
  theme: "yours-dark",
  is_enabled: true,
  last_seen: "2026-10-08T18:00:00.000Z",
  last_client: null,
  override_mode: null,
  override_payload: null,
  show_open_sign: true,
  open_sign_mode: "auto",
  open_sign_until: null,
  show_studio_bookings: false,
  customer_email: "secret@example.com",
};

function get(slug = "front-window", query = "") {
  return GET(new Request(`http://localhost/api/displays/${slug}/config${query}`), {
    params: Promise.resolve({ slug }),
  });
}

describe("GET /api/displays/:slug/config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDisplayBySlug.mockResolvedValue(row);
    mockTouch.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the row settings and does not write last_seen", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({
      mode: "film_menu",
      theme: "yours-dark",
      isEnabled: true,
      overrideMode: null,
      openSignMode: "auto",
      showOpenSign: true,
      showStudioBookings: false,
      buildId: displayBuildId(),
      menuRevision: "2026-10-01T15:00:00.000Z",
    });
    expect(JSON.stringify(body)).not.toMatch(/secret@|customer_email/);
    expect(body).not.toHaveProperty("last_seen");
    expect(mockTouch).not.toHaveBeenCalled();
    expect(mockGetDisplayBySlug).toHaveBeenCalledTimes(1);
  });

  it("does not check in a staff preview", async () => {
    const response = await get("front-window", "?preview=1");
    expect(response.status).toBe(200);
    expect(mockTouch).not.toHaveBeenCalled();
  });

  it("keeps the Open sign off every screen except the front window", async () => {
    mockGetDisplayBySlug.mockResolvedValue({
      ...row,
      slug: "studio-vertical",
      open_sign_mode: "on",
      show_open_sign: true,
      open_sign_until: "2026-10-09T04:00:00.000Z",
    });
    const response = await get("studio-vertical");
    const body = await response.json();
    expect(body.openSignMode).toBe("off");
    expect(body.showOpenSign).toBe(false);
    expect(body.openSignUntil).toBeNull();
  });

  it("does not look up a malformed slug", async () => {
    const response = await get("../film_orders");
    expect(response.status).toBe(404);
    expect(mockGetDisplayBySlug).not.toHaveBeenCalled();
    expect(mockTouch).not.toHaveBeenCalled();
  });
});
