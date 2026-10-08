import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { FILM_MENU_SEED } from "@/lib/film-menu";

const mockRequireAuth = vi.fn();
const mockSaveFilmMenu = vi.fn();
const mockGetCachedFilmMenu = vi.fn();
const mockClearFilmMenuCache = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock("@/lib/db", () => ({
  saveFilmMenu: (...args: unknown[]) => mockSaveFilmMenu(...args),
}));

vi.mock("@/lib/film-menu-cache", () => ({
  getCachedFilmMenu: (...args: unknown[]) => mockGetCachedFilmMenu(...args),
  clearFilmMenuCache: () => mockClearFilmMenuCache(),
}));

import { GET, PUT } from "@/app/api/film-menu/route";

describe("GET /api/film-menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: "user-1" });
    mockGetCachedFilmMenu.mockResolvedValue(FILM_MENU_SEED);
  });

  it("requires a staff session", async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mockGetCachedFilmMenu).not.toHaveBeenCalled();
  });

  it("returns the stored menu", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.menu.title).toBe("YOUR'S FILM MENU");
    expect(body.menu.sections[0].items).toHaveLength(35);
  });
});

describe("PUT /api/film-menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: "user-1" });
    mockSaveFilmMenu.mockImplementation(async (menu: unknown) => menu);
  });

  function put(body: unknown) {
    return PUT(new Request("http://localhost/api/film-menu", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
  }

  it("requires a staff session", async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    const response = await put({ menu: FILM_MENU_SEED });
    expect(response.status).toBe(401);
    expect(mockSaveFilmMenu).not.toHaveBeenCalled();
  });

  it("rejects a menu with no items or notes", async () => {
    const response = await put({ menu: { title: "Empty", sections: [], notes: [] } });
    expect(response.status).toBe(400);
    expect(mockSaveFilmMenu).not.toHaveBeenCalled();
  });

  it("saves sanitized sections, prices, and notes, and clears the cache", async () => {
    const response = await put({
      menu: {
        title: "YOUR'S FILM MENU",
        subtitle: "Durham, North Carolina",
        banner: ["PRICES SUBJECT TO CHANGE"],
        customer_email: "secret@example.com",
        sections: [
          {
            title: "35MM FILM",
            items: [
              { name: "Kodak Gold 200 - 35mm", price: "$12", email: "secret@example.com" },
              { name: "Expired 35mm/120 Roll", price: "$7" },
            ],
          },
          {
            title: "120 FILM",
            items: [{ name: "Expired 35mm/120 Roll", price: "$7" }],
          },
        ],
        notes: [
          { text: "Please rewind your film." },
          { text: "FILM PROCESSING", heading: true, phone: "919-555-0100" },
        ],
      },
    });

    expect(response.status).toBe(200);
    const saved = mockSaveFilmMenu.mock.calls[0][0];
    expect(saved).toEqual({
      title: "YOUR'S FILM MENU",
      subtitle: "Durham, North Carolina",
      banner: ["PRICES SUBJECT TO CHANGE"],
      sections: [
        {
          title: "35MM FILM",
          items: [
            { name: "Kodak Gold 200 - 35mm", price: "$12" },
            { name: "Expired 35mm/120 Roll", price: "$7" },
          ],
        },
        {
          title: "120 FILM",
          items: [{ name: "Expired 35mm/120 Roll", price: "$7" }],
        },
      ],
      notes: [
        { text: "Please rewind your film." },
        { text: "FILM PROCESSING", heading: true },
      ],
    });
    expect(mockClearFilmMenuCache).toHaveBeenCalledTimes(1);
    const body = await response.json();
    expect(body.menu).toEqual(saved);
    expect(JSON.stringify(body)).not.toMatch(/secret@|919/);
  });
});
