import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mockRequireAdmin = vi.fn();
const mockListDisplays = vi.fn();
const mockUpdateDisplay = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
}));

vi.mock("@/lib/db", () => ({
  listDisplays: (...args: unknown[]) => mockListDisplays(...args),
  updateDisplay: (...args: unknown[]) => mockUpdateDisplay(...args),
}));

import { GET, PATCH } from "@/app/api/dashboard/displays/route";

const row = {
  id: "display-1",
  slug: "front-window",
  name: "Front window",
  location: "Front window",
  orientation: "landscape",
  resolution: "1920x1080",
  mode: "film_menu",
  playlist_id: null,
  theme: "yours-dark",
  is_enabled: true,
  last_seen: null,
  last_client: null,
  override_mode: null,
  override_payload: null,
  show_open_sign: false,
  open_sign_mode: "off",
  open_sign_until: null,
};

describe("dashboard display controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ id: "admin-1" });
    mockListDisplays.mockResolvedValue([row, { ...row, slug: "studio-vertical", name: "Studio Vertical", mode: "idle" }]);
    mockUpdateDisplay.mockImplementation(async (_slug: string, patch: Record<string, unknown>) => ({ ...row, ...patch }));
  });

  it("hides the screens from anyone who is not an admin", async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mockListDisplays).not.toHaveBeenCalled();
  });

  it("saves mode, open sign, and the show-open-sign switch", async () => {
    const listed = await GET();
    expect(listed.status).toBe(200);
    const body = await listed.json();
    expect(body.displays.map((display: { slug: string }) => display.slug)).toEqual(["front-window", "studio-vertical"]);

    const response = await PATCH(new Request("http://localhost/api/dashboard/displays", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "front-window", mode: "film_stats", openSignMode: "auto", showOpenSign: true }),
    }));
    expect(response.status).toBe(200);
    expect(mockUpdateDisplay).toHaveBeenCalledWith("front-window", {
      mode: "film_stats",
      open_sign_mode: "auto",
      open_sign_until: null,
      show_open_sign: true,
    });
    expect(await response.json()).toMatchObject({
      slug: "front-window",
      mode: "film_stats",
      openSignMode: "auto",
      showOpenSign: true,
    });
  });

  it("rejects an open sign value outside auto, on, and off", async () => {
    const response = await PATCH(new Request("http://localhost/api/dashboard/displays", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "front-window", openSignMode: "yes" }),
    }));
    expect(response.status).toBe(400);
    expect(mockUpdateDisplay).not.toHaveBeenCalled();
  });
});
