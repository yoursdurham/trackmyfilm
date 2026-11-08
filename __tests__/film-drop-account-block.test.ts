import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { filmDropAccountUrl } from "../lib/email-service";

const html = readFileSync(
  resolve(__dirname, "../docs/resend-email-templates/film-drop-received-account-block.html"),
  "utf8",
);

describe("film drop account block", () => {
  it("uses the template's triple-brace variable and a solid fallback", () => {
    expect(html).toContain('href="{{{account_url}}}"');
    expect(html).not.toMatch(/href="\{\{account_url\}\}"/);
    expect(html).toContain("YOUR FILM, ALL TOGETHER");
    expect(html).toContain("Keep track of every roll");
    expect(html).toContain(
      "Create a free Track My Film account to see all your orders and the film stocks you've shot in one place.",
    );
    expect(html).toContain("Create your account →");
    expect(html).toContain('bgcolor="#F3E4D0"');
    expect(html).toContain("background-color:#F3E4D0");
    expect(html).toContain("linear-gradient(128deg,#DDB1B1 0%,#F4E4C4 48%,#A1CC93 100%)");
    expect(html).toContain('role="presentation"');
    expect(html).toContain('lang="en"');
    expect(html).toContain('dir="ltr"');
    expect(html).not.toMatch(/display:\s*flex|display:\s*grid/);
    expect(html).toContain("<h2");
    expect(html).not.toContain("<h1");
  });

  it("builds a login link and drops the address when the URL would exceed Resend's string cap", () => {
    expect(filmDropAccountUrl("ada@example.com")).toBe(
      "https://trackmyfilm.com/account/login?email=ada%40example.com",
    );
    expect(filmDropAccountUrl(`${"a".repeat(1960)}@example.com`)).toBe(
      "https://trackmyfilm.com/account/login",
    );
  });
});
