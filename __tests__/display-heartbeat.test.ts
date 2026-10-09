import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mockTouch = vi.fn();

vi.mock("@/lib/db", () => ({
  touchDisplayHeartbeat: (...args: unknown[]) => mockTouch(...args),
}));

import { POST } from "@/app/api/displays/[slug]/heartbeat/route";
import { clearDisplayHeartbeatThrottle, HEARTBEAT_WRITE_INTERVAL_MS } from "@/lib/display-heartbeat";

function post(slug = "studio-vertical") {
  return POST(new Request(`http://localhost/api/displays/${slug}/heartbeat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appVersion: "phase1" }),
  }), {
    params: Promise.resolve({ slug }),
  });
}

describe("POST /api/displays/:slug/heartbeat", () => {
  beforeEach(() => {
    clearDisplayHeartbeatThrottle();
    mockTouch.mockReset();
  });

  afterEach(() => {
    clearDisplayHeartbeatThrottle();
    vi.restoreAllMocks();
  });

  it("writes at most once inside five minutes", async () => {
    mockTouch.mockResolvedValue(true);
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);

    const first = await post();
    const second = await post();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockTouch).toHaveBeenCalledTimes(1);

    vi.mocked(Date.now).mockReturnValue(1_000_000 + HEARTBEAT_WRITE_INTERVAL_MS);
    const third = await post();
    expect(third.status).toBe(200);
    expect(mockTouch).toHaveBeenCalledTimes(2);
  });

  it("does not remember a missing screen", async () => {
    mockTouch.mockResolvedValue(false);
    const response = await post("missing-screen");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Unknown screen" });

    const again = await post("missing-screen");
    expect(again.status).toBe(404);
    expect(mockTouch).toHaveBeenCalledTimes(2);
  });

  it("keeps the response private", async () => {
    mockTouch.mockResolvedValue(true);
    const response = await post();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response).toBeInstanceOf(NextResponse);
  });
});
