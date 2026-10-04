import { describe, it, expect } from "vitest";
import { formatScanSizeLabel } from "../lib/scan-size-display";

describe("formatScanSizeLabel", () => {
  it("passes through canonical labels", () => {
    expect(formatScanSizeLabel("Standard")).toBe("Standard");
    expect(formatScanSizeLabel("High-Res")).toBe("High-Res");
    expect(formatScanSizeLabel("Process Only")).toBe("Process Only");
  });

  it("maps legacy/snake_case values", () => {
    expect(formatScanSizeLabel("high_res")).toBe("High-Res");
    expect(formatScanSizeLabel("process_only")).toBe("Process Only");
    expect(formatScanSizeLabel("tiff")).toBe("TIFF");
  });

  it("returns null for empty values", () => {
    expect(formatScanSizeLabel(null)).toBeNull();
    expect(formatScanSizeLabel("")).toBeNull();
  });
});
