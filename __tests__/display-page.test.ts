import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mockGetDisplay = vi.fn();
const mockPayload = vi.fn();

vi.mock("@/lib/db", () => ({
  getDisplayBySlug: (...args: unknown[]) => mockGetDisplay(...args),
}));

vi.mock("@/lib/display-screen", () => ({
  publicPayloadWithFilm: (...args: unknown[]) => mockPayload(...args),
}));

import DisplayPage from "@/app/display/[slug]/page";

describe("display page", () => {
  beforeEach(() => {
    mockGetDisplay.mockReset();
    mockPayload.mockReset();
  });

  it("does not read the database when the TV loads", async () => {
    const page = await DisplayPage({
      params: Promise.resolve({ slug: "front-window" }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("data-display-orientation=\"landscape\"");
    expect(mockGetDisplay).not.toHaveBeenCalled();
    expect(mockPayload).not.toHaveBeenCalled();
  });

  it("still loads the live row for a staff preview", async () => {
    mockGetDisplay.mockResolvedValue({
      slug: "studio-vertical",
      orientation: "portrait",
    });
    mockPayload.mockResolvedValue({
      mode: "film_menu",
      theme: "crt-green",
      refreshSeconds: 30,
      buildId: "dev",
      data: {},
    });

    const page = await DisplayPage({
      params: Promise.resolve({ slug: "studio-vertical" }),
      searchParams: Promise.resolve({ preview: "1" }),
    });
    const html = renderToStaticMarkup(page);
    expect(mockGetDisplay).toHaveBeenCalledTimes(1);
    expect(mockGetDisplay).toHaveBeenCalledWith("studio-vertical");
    expect(mockPayload).toHaveBeenCalledTimes(1);
    expect(html).toContain("data-display-orientation=\"portrait\"");
  });
});
