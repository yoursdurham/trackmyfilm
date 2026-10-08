import { describe, expect, it } from "vitest";
import { safeNextPath } from "../lib/auth-redirect";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/login/update-password")).toBe("/login/update-password");
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
  });

  it("rejects off-site redirects", () => {
    expect(safeNextPath("https://evil.example/phish")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});