import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLoad = vi.fn();

vi.mock("@/lib/turnaround-data", () => ({
  getCachedPublicTurnaround: () => mockLoad(),
}));

import { GET, OPTIONS } from "@/app/api/turnaround/route";

const SAMPLE = {
  avgDays: 5.3,
  pctWithin8Days: 75,
  color: { avgDays: 4.7 },
  bw: { avgDays: 6 },
  windowDays: 30,
  updatedAt: "2026-10-27T15:00:00.000Z",
};

function request(origin?: string) {
  return new Request("https://trackmyfilm.com/api/turnaround", {
    headers: origin ? { origin } : {},
  });
}

describe("GET /api/turnaround", () => {
  beforeEach(() => {
    mockLoad.mockReset();
    mockLoad.mockResolvedValue(SAMPLE);
  });

  it("returns the aggregate and the miles-saved cache headers", async () => {
    const response = await GET(request("https://www.yoursdurham.com"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(SAMPLE);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://www.yoursdurham.com");
    expect(response.headers.get("Vary")).toBe("Origin");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
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
    mockLoad.mockRejectedValue(new Error("query failed"));
    const response = await GET(request("https://www.yoursdurham.com"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Turnaround unavailable" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
