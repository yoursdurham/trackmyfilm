import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AccountProfile from "../components/account/AccountProfile";
import { previewAccountProfile } from "../lib/account-profile";

describe("Try something new card", () => {
  it("sits after favorite stocks and before contact, only with this profile's links", () => {
    const profile = previewAccountProfile(new Date("2026-10-22T15:00:00.000Z"));
    const html = renderToStaticMarkup(<AccountProfile profile={profile} />);
    const favorites = html.indexOf('data-testid="favorites"');
    const card = html.indexOf('data-testid="try-something-new"');
    const contact = html.indexOf('data-testid="contact"');
    expect(favorites).toBeGreaterThan(-1);
    expect(card).toBeGreaterThan(favorites);
    expect(contact).toBeGreaterThan(card);
    expect(html).toContain("Try something new");
    expect(html).toContain("bg-[#DDB1B1]");
    for (const film of profile.recommendations) {
      expect(html).toContain(film.stock);
      expect(html).toContain(film.blurb);
      expect(html).toContain(`href="${film.href}"`);
    }
    expect(html).not.toContain("Bea Knitter");

    const hidden = renderToStaticMarkup(
      <AccountProfile profile={profile} ordersUnavailable />,
    );
    expect(hidden).not.toContain('data-testid="try-something-new"');
  });
});
