import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACCOUNT_SIGN_IN_SUBJECT,
  accountSignInConfirmUrl,
  accountSignInEmailHtml,
  accountSignInEmailText,
  supabaseConfirmSignupEmailHtml,
  supabaseMagicLinkEmailHtml,
} from "../lib/account-sign-in-email";

const CONFIRM_URL = "https://trackmyfilm.com/auth/confirm?token_hash=hashed-token&type=magiclink&next=%2Faccount";

describe("account sign-in email", () => {
  it("builds a confirm link the existing /auth/confirm route can verify", () => {
    expect(accountSignInConfirmUrl("https://trackmyfilm.com", "a<b>&\"c")).toBe(
      "https://trackmyfilm.com/auth/confirm?token_hash=a%3Cb%3E%26%22c&type=magiclink&next=%2Faccount",
    );
  });

  it("uses the Track My Film sign-in layout instead of a Resend template", () => {
    const html = accountSignInEmailHtml(CONFIRM_URL, "https://trackmyfilm.com/logo.png", "482913");
    expect(ACCOUNT_SIGN_IN_SUBJECT).toBe("Your Track My Film sign-in link");
    expect(html).toContain("background:#FFF6D3");
    expect(html).toContain("background:#DDB1B1");
    expect(html).toContain("background:#C9B7C6;border:1px solid #1a1a1a");
    expect(html).toContain("background:#E4D48A;border:1px solid #1a1a1a");
    expect(html).toContain("background:#A9C99A;border:1px solid #1a1a1a");
    expect(html).toContain("background:#A1CC93");
    expect(html).toContain("JetBrains Mono");
    expect(html).toContain("Sign in to Track My Film");
    expect(html).toContain("Tap the button below, or enter the 6-digit code on the sign-in page. Each works once and expires in 1 hour.");
    expect(html).toContain("Sign in →");
    expect(html).toContain("Or enter this code on the sign-in page:");
    expect(html).toContain("font-size:32px");
    expect(html).toContain("482913");
    expect(html.indexOf("Sign in →")).toBeLessThan(html.indexOf("482913"));
    expect(html.indexOf("482913")).toBeLessThan(html.indexOf("Or paste this link into your browser:"));
    expect(html).toContain("Didn't ask for this? You can ignore this email.");
    expect(html).toContain("https://www.yoursdurham.com");
    expect(html).toContain("209 N. Gregson St. Durham, NC 27701");
    expect(html).toContain("Retail Hours: Thursdays 5-7PM &amp; Saturdays 11-2PM");
    expect(html).toContain("hello@yoursdurham.com");
    expect(html).toContain("Film Drop Box - 24/7");
    expect(html).toContain('alt="Yours, Durham"');
    expect(html).toContain("https://trackmyfilm.com/logo.png");
    expect(html).toContain("token_hash=hashed-token&amp;type=magiclink&amp;next=%2Faccount");
    expect(html).not.toContain("WeTransfer");
    expect(html).not.toContain("{{");
  });

  it("escapes the link and keeps a plain-text fallback", () => {
    const tricky = "https://trackmyfilm.com/auth/confirm?token_hash=a<b>&\"c&type=magiclink";
    const html = accountSignInEmailHtml(tricky, "https://trackmyfilm.com/logo.png?q=\"x\"");
    expect(html).not.toContain("a<b>");
    expect(html).toContain("a&lt;b&gt;");
    expect(html).toContain("&amp;type=magiclink");
    expect(html).toContain("logo.png?q=&quot;x&quot;");
    const text = accountSignInEmailText(CONFIRM_URL, "482913");
    expect(text).toContain("Sign in to Track My Film");
    expect(text).toContain(`Sign in: ${CONFIRM_URL}`);
    expect(text).toContain("Or enter this code on the sign-in page: 482913");
    expect(text).toContain("Didn't ask for this? You can ignore this email.");
    expect(text).toContain("209 N. Gregson St. Durham, NC 27701");
    expect(text).not.toContain("&amp;");
  });

  it("leaves the code out when Supabase did not return 6 digits", () => {
    const html = accountSignInEmailHtml(CONFIRM_URL, "https://trackmyfilm.com/logo.png");
    expect(html).not.toContain("Or enter this code");
    expect(html).toContain("token_hash=hashed-token");
  });

  it("matches the saved Supabase magic-link and confirm-signup templates", () => {
    const magic = supabaseMagicLinkEmailHtml();
    const signup = supabaseConfirmSignupEmailHtml();
    for (const html of [magic, signup]) {
      expect(html).toContain("{{ .Token }}");
      expect(html).toContain("{{ .ConfirmationURL }}");
      expect(html).toContain("background:#FFF6D3");
      expect(html).toContain("background:#DDB1B1");
      expect(html).toContain("background:#A1CC93");
      expect(html).toContain("https://trackmyfilm.com/logo.png");
      expect(html).toContain("Or enter this code on the sign-in page:");
      expect(html.indexOf("{{ .Token }}")).toBeGreaterThan(html.indexOf("background:#A1CC93"));
    }
    expect(magic).toContain("Sign in to Track My Film");
    expect(magic).toContain("Sign in →");
    expect(signup).toContain("Confirm your Track My Film account");
    expect(signup).toContain("Confirm email →");
    expect(readFileSync("docs/supabase-email-templates/magic-link.html", "utf8")).toBe(magic);
    expect(readFileSync("docs/supabase-email-templates/confirm-signup.html", "utf8")).toBe(signup);
  });
});
