import { describe, it, expect } from "vitest";
import { computeCalculatedPreferences, orderProcessSummary } from "../lib/customer-preference-calculations";
import type { FilmOrder } from "../lib/types";

function order(overrides: Partial<FilmOrder> = {}): FilmOrder {
  return {
    id: "o1",
    order_number: "JE1",
    customer_id: "c1",
    customer_name: "Test",
    customer_email: "t@example.com",
    status: "Scans Sent",
    status_history: [],
    status_updated_at: "2026-01-01",
    film_type: "35mm",
    film_process: "Color",
    roll_count: 1,
    dropoff_date: "2026-01-01",
    dropoff_number: 1,
    ...overrides,
  };
}

describe("computeCalculatedPreferences", () => {
  it("returns empty when no orders", () => {
    const prefs = computeCalculatedPreferences([]);
    expect(prefs.film_type.value).toBeNull();
    expect(prefs.film_process.value).toBeNull();
  });

  it("counts roll-level film types in mixed orders", () => {
    const prefs = computeCalculatedPreferences([
      order({
        dropoff_date: "2026-02-01",
        roll_details: [
          { film_type: "35mm", film_process: "Color", scan_size: "Standard" },
          { film_type: "120", film_process: "Black & White", scan_size: "Standard" },
        ],
      }),
      order({
        id: "o2",
        dropoff_date: "2026-01-01",
        roll_details: [
          { film_type: "35mm", film_process: "Color", scan_size: "Standard" },
          { film_type: "35mm", film_process: "Color", scan_size: "Standard" },
        ],
      }),
    ]);
    expect(prefs.film_type.value).toBe("35mm");
    expect(prefs.film_process.value).toBe("Color");
  });

  it("splits Both process into Color and B&W counts", () => {
    const prefs = computeCalculatedPreferences([
      order({
        roll_details: [
          { film_type: "35mm", film_process: "Both", scan_size: "Standard" },
        ],
      }),
    ]);
    expect(prefs.film_process.sampleCount).toBe(2);
  });

  it("prefers most recent value on tie", () => {
    const prefs = computeCalculatedPreferences([
      order({
        id: "old",
        dropoff_date: "2026-01-01",
        roll_details: [{ film_type: "120", film_process: "Color", scan_size: "Standard" }],
      }),
      order({
        id: "new",
        dropoff_date: "2026-03-01",
        roll_details: [{ film_type: "35mm", film_process: "Color", scan_size: "Standard" }],
      }),
    ]);
    expect(prefs.film_type.value).toBe("35mm");
  });
});

describe("orderProcessSummary", () => {
  it("shows Mixed for color and bw rolls", () => {
    const summary = orderProcessSummary(order({
      roll_details: [
        { film_type: "35mm", film_process: "Color", scan_size: "Standard" },
        { film_type: "35mm", film_process: "Black & White", scan_size: "Standard" },
      ],
    }));
    expect(summary).toBe("Mixed");
  });
});
