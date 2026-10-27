import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import nextConfig from "../next.config";
import EmbedLayout, { EMBED_PAGE_STYLE } from "@/app/embed/layout";
import EmbedSharePhotosPage from "@/app/embed/share-photos/page";
import SharePhotosForm from "@/components/photos/SharePhotosForm";
import { documentContentHeight, postEmbedHeight, watchEmbedHeight } from "@/lib/embed-resize";
import { PHOTO_HONEYPOT_FIELD, PHOTO_PERMISSION_LABEL } from "@/lib/photo-submissions";
import { EMBED_FRAME_ANCESTORS } from "@/lib/security-headers";

describe("embed share photos page", () => {
  it("renders the public form with no site header", () => {
    const html = renderToStaticMarkup(
      <EmbedLayout>
        <EmbedSharePhotosPage />
      </EmbedLayout>,
    );
    expect(html).toContain('data-testid="embed-share-photos"');
    expect(html).toContain('id="share-photos-email"');
    expect(html).toContain(`name="${PHOTO_HONEYPOT_FIELD}"`);
    expect(html).toContain(PHOTO_PERMISSION_LABEL);
    expect(html).toContain(">Submit<");
    expect(html).toContain("bg-[#DDB1B1]");
    expect(html).toContain("bg-[#FFF6D3]");
    expect(html).toContain("bg-[#A1CC93]");
    expect(html).toContain("font-jetbrains");
    expect(html).toContain('data-cookie-free-upload="true"');
    expect(html).toContain("background-color: #FFF6D3");
    expect(html).toContain("background-color: transparent");
    expect(html).toContain(EMBED_PAGE_STYLE);
    expect(html).not.toContain("Log in to view orders");
    expect(html).not.toContain("Track My Film");
    expect(html).not.toContain("Explore Our Services");
  });

  it("keeps the homepage form on the cookie session client", () => {
    const html = renderToStaticMarkup(<SharePhotosForm mode="public" />);
    expect(html).not.toContain("data-cookie-free-upload");
    expect(html).toContain('id="share-photos-email"');
  });
});

describe("embed framing headers", () => {
  it("allows the shop site to frame /embed and keeps SAMEORIGIN everywhere else", async () => {
    const rules = await nextConfig.headers!();
    const merged = (path: string) => {
      const headers = new Map<string, string>();
      for (const rule of rules) {
        const match = getPathMatch(rule.source);
        if (!match(path)) continue;
        for (const header of rule.headers) headers.set(header.key.toLowerCase(), header.value);
      }
      return headers;
    };

    for (const path of ["/", "/tracking", "/account", "/dashboard", "/embedded", "/api/photo-submissions"]) {
      const headers = merged(path);
      expect(headers.get("x-frame-options"), path).toBe("SAMEORIGIN");
      expect(headers.has("content-security-policy"), path).toBe(false);
      expect(headers.get("x-content-type-options"), path).toBe("nosniff");
    }

    for (const path of ["/embed", "/embed/", "/embed/share-photos"]) {
      const headers = merged(path);
      expect(headers.has("x-frame-options"), path).toBe(false);
      expect(headers.get("content-security-policy"), path).toBe(EMBED_FRAME_ANCESTORS);
      expect(headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(headers.get("referrer-policy"), path).toBe("strict-origin-when-cross-origin");
    }
  });
});

describe("embed height messages", () => {
  it("posts the document content height on load and whenever it changes", () => {
    const doc = {
      documentElement: { scrollHeight: 480.2 },
      body: { scrollHeight: 300 },
    };
    const parent = { postMessage: vi.fn() };
    const observed: object[] = [];
    let callback: () => void = () => {};
    let disconnected = false;
    class FakeObserver {
      constructor(next: () => void) {
        callback = next;
      }
      observe(target: object) {
        observed.push(target);
      }
      disconnect() {
        disconnected = true;
      }
    }
    vi.stubGlobal("ResizeObserver", FakeObserver);

    expect(documentContentHeight(doc)).toBe(481);
    const stop = watchEmbedHeight(doc, parent);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    expect(parent.postMessage).toHaveBeenCalledWith({ type: "tmf-embed-height", height: 481 }, "*");
    expect(observed).toEqual([doc.documentElement, doc.body]);

    doc.documentElement.scrollHeight = 220;
    doc.body.scrollHeight = 640.1;
    callback();
    expect(parent.postMessage).toHaveBeenLastCalledWith({ type: "tmf-embed-height", height: 641 }, "*");

    stop();
    expect(disconnected).toBe(true);
    expect(postEmbedHeight({ documentElement: { scrollHeight: 10 }, body: null }, parent)).toBe(10);
    vi.unstubAllGlobals();
  });
});
