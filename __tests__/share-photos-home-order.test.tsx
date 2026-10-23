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
  it("puts the public uploader below Explore Our Services", () => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <TrackingHome milesSaved={<p>96 mi</p>} logInToViewOrders={null} resultAccountLink={null} />
      </QueryClientProvider>,
    );
    const services = html.indexOf("Explore Our Services");
    const share = html.indexOf('data-testid="home-share-photos"');
    const info = html.indexOf(">INFO:<");
    expect(services).toBeGreaterThan(-1);
    expect(share).toBeGreaterThan(services);
    expect(info).toBeGreaterThan(share);
  });

  it("leaves the account uploader after Contact", () => {
    const profile = renderToStaticMarkup(<AccountProfile profile={previewAccountProfile()} />);
    const contact = profile.indexOf('data-testid="contact"');
    const share = profile.indexOf('data-testid="share-photos-section"');
    expect(share).toBeGreaterThan(contact);
    expect(profile).not.toContain('data-testid="home-share-photos"');
  });
});
