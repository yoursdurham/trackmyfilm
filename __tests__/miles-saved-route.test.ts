import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLoad = vi.fn();

vi.mock("@/lib/miles-saved-data", () => ({
  getCachedPublicMilesSaved: () => mockLoad(),
}));

import { GET, OPTIONS } from "@/app/api/miles-saved/route";
import { EARTH_CIRCUMFERENCE_MILES, roundLaps } from "@/lib/miles-saved";

const MILES = 34464;

function request(origin?: string) {
  return new Request("https://trackmyfilm.com/api/miles-saved", {
    headers: origin ? { origin } : {},
  });
}

describe("GET /api/miles-saved", () => {
  beforeEach(() => {
    mockLoad.mockReset();
    mockLoad.mockResolvedValue({
      miles: MILES,
      laps: MILES / EARTH_CIRCUMFERENCE_MILES,
      year: 2026,
    });
  });

  it("returns the homepage miles and the same laps rounded to 2 decimals", async () => {
    const response = await GET(request("https://www.yoursdurham.com"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      miles: MILES,
      laps: roundLaps(MILES / EARTH_CIRCUMFERENCE_MILES),
      year: 2026,
    });
    expect(roundLaps(MILES / EARTH_CIRCUMFERENCE_MILES)).toBe(1.38);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://www.yoursdurham.com");
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("echoes the apex origin and hides the header for everyone else", async () => {
    const apex = await GET(request("https://yoursdurham.com"));
    expect(apex.headers.get("Access-Control-Allow-Origin")).toBe("https://yoursdurham.com");

    const other = await GET(request("https://evil.example"));
    expect(other.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(other.headers.get("Vary")).toBe("Origin");

    const none = await GET(request());
    expect(none.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("answers a preflight without a body", async () => {
    const response = OPTIONS(request("https://yoursdurham.com"));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://yoursdurham.com");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(response.headers.get("Vary")).toBe("Origin");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
  });

  it("does not cache a failure", async () => {
    mockLoad.mockRejectedValue(new Error("count failed"));
    const response = await GET(request("https://www.yoursdurham.com"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Miles saved unavailable" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
