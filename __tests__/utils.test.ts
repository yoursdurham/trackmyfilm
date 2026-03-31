import { describe, it, expect } from "vitest";
import { cn } from "../lib/utils";

describe("cn (class name utility)", () => {
  it("returns a single class unchanged", () => {
    expect(cn("text-slate-800")).toBe("text-slate-800");
  });

  it("merges multiple classes", () => {
    expect(cn("p-4", "rounded-lg")).toBe("p-4 rounded-lg");
  });

  it("resolves Tailwind conflicts — last value wins", () => {
    // tailwind-merge should keep the last padding value
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("ignores falsy values", () => {
    expect(cn("p-4", false, undefined, null, "rounded")).toBe("p-4 rounded");
  });

  it("handles conditional classes", () => {
    const isActive = true;
    expect(cn("base", isActive && "active")).toBe("base active");
    expect(cn("base", !isActive && "active")).toBe("base");
  });

  it("returns empty string for no args", () => {
    expect(cn()).toBe("");
  });
});
