import { describe, it, expect } from "vitest";
import {
  applyCustomerDefaultsToRolls,
  cloneDropoffRoll,
  createEmptyDropoffRoll,
  duplicateDropoffRollAt,
  syncRollCount,
  type DropoffRollState,
} from "../lib/dropoff-roll-state";
import type { Customer } from "../lib/types";

const MAX = 20;

function filledRoll(overrides: Partial<DropoffRollState> = {}): DropoffRollState {
  return {
    film_type: "35mm",
    film_process: "Color",
    film_stock: "Kodak Gold 200",
    custom_stock: "",
    scan_size: "Standard",
    prints_4x6: true,
    ...overrides,
  };
}

describe("createEmptyDropoffRoll", () => {
  it("defaults to 35mm film type", () => {
    expect(createEmptyDropoffRoll().film_type).toBe("35mm");
  });

  it("defaults to Standard scan size", () => {
    expect(createEmptyDropoffRoll().scan_size).toBe("Standard");
  });

  it("defaults to Color film process", () => {
    expect(createEmptyDropoffRoll().film_process).toBe("Color");
  });
});

describe("syncRollCount", () => {
  it("adds blank rolls defaulting to 35mm + Standard", () => {
    const rolls = syncRollCount([createEmptyDropoffRoll()], 3, MAX);
    expect(rolls).toHaveLength(3);
    expect(rolls[1].film_type).toBe("35mm");
    expect(rolls[1].scan_size).toBe("Standard");
    expect(rolls[2].film_type).toBe("35mm");
    expect(rolls[2].scan_size).toBe("Standard");
  });

  it("keeps roll_count aligned when trimming", () => {
    const rolls = syncRollCount([filledRoll(), filledRoll(), filledRoll()], 2, MAX);
    expect(rolls).toHaveLength(2);
  });
});

describe("duplicateDropoffRollAt", () => {
  it("copies all roll-specific fields from the original", () => {
    const rolls = [filledRoll({ film_type: "120", scan_size: "High-Res" })];
    const next = duplicateDropoffRollAt(rolls, 0, MAX)!;
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual(rolls[0]);
    expect(next[1].film_type).toBe("120");
    expect(next[1].film_process).toBe("Color");
    expect(next[1].scan_size).toBe("High-Res");
    expect(next[1].prints_4x6).toBe(true);
    expect(next[1].film_stock).toBe("Kodak Gold 200");
  });

  it("copies custom stock when Other is selected", () => {
    const rolls = [filledRoll({ film_stock: "__other__", custom_stock: "Vision3 500T" })];
    const next = duplicateDropoffRollAt(rolls, 0, MAX)!;
    expect(next[1].film_stock).toBe("__other__");
    expect(next[1].custom_stock).toBe("Vision3 500T");
  });

  it("inserts duplicate immediately after the source roll", () => {
    const rolls = [
      filledRoll({ film_stock: "A" }),
      filledRoll({ film_stock: "B" }),
      filledRoll({ film_stock: "C" }),
    ];
    const next = duplicateDropoffRollAt(rolls, 1, MAX)!;
    expect(next.map((r) => r.film_stock)).toEqual(["A", "B", "B", "C"]);
  });

  it("does not share object references between original and duplicate", () => {
    const rolls = [filledRoll()];
    const next = duplicateDropoffRollAt(rolls, 0, MAX)!;
    next[1].film_process = "Black & White";
    next[1].film_stock = "Changed";
    expect(rolls[0].film_process).toBe("Color");
    expect(rolls[0].film_stock).toBe("Kodak Gold 200");
  });

  it("supports repeated duplication", () => {
    let rolls = [filledRoll()];
    for (let i = 0; i < 4; i++) {
      rolls = duplicateDropoffRollAt(rolls, 0, MAX)!;
    }
    expect(rolls).toHaveLength(5);
    rolls.forEach((roll) => {
      expect(roll.film_type).toBe("35mm");
      expect(roll.film_process).toBe("Color");
    });
  });

  it("returns null at max rolls so roll_count stays capped", () => {
    const rolls = Array.from({ length: MAX }, () => createEmptyDropoffRoll());
    expect(duplicateDropoffRollAt(rolls, 0, MAX)).toBeNull();
    expect(rolls).toHaveLength(MAX);
  });
});

describe("cloneDropoffRoll independence", () => {
  it("changing clone does not change original", () => {
    const original = filledRoll();
    const copy = cloneDropoffRoll(original);
    copy.scan_size = "TIFF";
    expect(original.scan_size).toBe("Standard");
  });
});

describe("applyCustomerDefaultsToRolls", () => {
  it("applies saved customer preferences over roll defaults", () => {
    const rolls = [createEmptyDropoffRoll(), createEmptyDropoffRoll()];
    const customer = {
      default_film_type: "110" as const,
      default_film_process: "Black & White" as const,
      default_scan_size: "High-Res",
    } satisfies Pick<Customer, "default_film_type" | "default_film_process" | "default_scan_size">;

    const next = applyCustomerDefaultsToRolls(rolls, customer);
    expect(next[0].film_type).toBe("110");
    expect(next[0].film_process).toBe("Black & White");
    expect(next[0].scan_size).toBe("High-Res");
    expect(next[1].film_type).toBe("110");
  });

  it("leaves rolls unchanged when customer has no defaults", () => {
    const rolls = [createEmptyDropoffRoll()];
    const next = applyCustomerDefaultsToRolls(rolls, {});
    expect(next).toBe(rolls);
  });

  it("120 and 110 remain selectable via customer defaults", () => {
    const rolls = [createEmptyDropoffRoll()];
    const for120 = applyCustomerDefaultsToRolls(rolls, { default_film_type: "120" });
    expect(for120[0].film_type).toBe("120");
    const for110 = applyCustomerDefaultsToRolls(rolls, { default_film_type: "110" });
    expect(for110[0].film_type).toBe("110");
  });
});
