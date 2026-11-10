import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import TrackingHome from "@/app/tracking/TrackingHome";
import AccountProfile from "@/components/account/AccountProfile";
import { previewAccountProfile } from "@/lib/account-profile";

describe("Share your photos placement", () => {
  it("keeps the public uploader off the tracking homepage", () => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <TrackingHome milesSaved={<p>96 mi</p>} logInToViewOrders={null} resultAccountLink={null} />
      </QueryClientProvider>,
    );
    const services = html.indexOf("Explore Our Services");
    const info = html.indexOf(">INFO:<");
    expect(services).toBeGreaterThan(-1);
    expect(info).toBeGreaterThan(services);
    expect(html).toContain("Film Developing");
    expect(html).toContain("Shop Film");
    expect(html).toContain("Need help?");
    expect(html).not.toContain('data-testid="home-share-photos"');
    expect(html).not.toContain("Share your photos");
    expect(html).not.toContain('id="share-photos-email"');
    expect(html).not.toContain("Choose photos");

    const yours = html.indexOf('data-testid="yours-durham-link"');
    expect(yours).toBeGreaterThan(-1);
    expect(yours).toBeLessThan(services);
  });

  it("puts the account uploader after Try something new and above Contact", () => {
    const profile = renderToStaticMarkup(<AccountProfile profile={previewAccountProfile()} />);
    const recommend = profile.indexOf('data-testid="try-something-new"');
    const share = profile.indexOf('data-testid="share-photos-section"');
    const contact = profile.indexOf('data-testid="contact"');
    expect(recommend).toBeGreaterThan(-1);
    expect(share).toBeGreaterThan(recommend);
    expect(contact).toBeGreaterThan(share);
    expect(profile).not.toContain('data-testid="home-share-photos"');
  });
});
