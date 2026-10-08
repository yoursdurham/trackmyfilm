import { describe, expect, it } from "vitest";
import { NUMBERS_PATH, numbersPageRedirect } from "../lib/numbers-access";

describe("Numbers tab", () => {
  it("targets the numbers route, not the public tracker", () => {
    expect(NUMBERS_PATH).toBe("/numbers");
    expect(NUMBERS_PATH).not.toBe("/");
    expect(NUMBERS_PATH).not.toBe("/tracking");
  });

  it("keeps a signed-in staff member on the Numbers view", () => {
    expect(numbersPageRedirect(true)).toBeNull();
  });

  it("sends a signed-out visitor to login instead of the site root", () => {
    expect(numbersPageRedirect(false)).toBe("/login");
  });
});
