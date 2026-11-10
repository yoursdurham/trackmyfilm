import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PublicHeader, { TRACK_MY_FILM_SUBTEXT } from "@/components/PublicHeader";
import { YOURS_BLEND_COLORS } from "@/lib/brand-colors";

describe("public header tagline", () => {
  it("links Yours, Durham to the studio site and turns the palette green on hover", () => {
    const html = renderToStaticMarkup(<PublicHeader />);
    const link = html.match(/<a[^>]*data-testid="yours-durham-link"[^>]*>[\s\S]*?<\/a>/)?.[0];

    expect(TRACK_MY_FILM_SUBTEXT).toBe("A Project by Yours, Durham");
    expect(html).toContain("A Project by ");
    expect(link).toBeDefined();
    expect(link).toContain('href="https://yoursdurham.com"');
    expect(link).toContain(">Yours, Durham</a>");
    expect(link).toContain("text-neutral-800");
    expect(link).toContain("no-underline");
    expect(link).toContain("visited:text-neutral-800");
    expect(link).toContain(`hover:text-[${YOURS_BLEND_COLORS[2]}]`);
    expect(link).toContain("focus-visible:ring-2");
    expect(link).toContain("focus-visible:ring-neutral-900");
    expect(link).toContain("focus-visible:ring-offset-[#FFF6D3]");
    expect(link).not.toContain("target=");
    expect(link).not.toMatch(/(?:^|\s)underline(?:\s|$)/);
  });
});
