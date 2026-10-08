import { describe, expect, it } from "vitest";
import {
  DEPARTURE_ORDER_SELECT,
  computeFilmDepartures,
  formatDepartureName,
  sanitizeFilmDepartures,
  type DepartureOrder,
} from "@/lib/film-departures";

const NOW = new Date("2026-10-08T19:00:00.000Z"); // Thursday Oct 8, 2026, 3:00 PM EDT
const TUESDAY_NOON = "2026-10-06T16:00:00.000Z"; // Tue Oct 6, 12:00 PM EDT
const BEFORE_TUESDAY_NOON = "2026-10-06T15:59:59.000Z";

function order(overrides: DepartureOrder & Record<string, unknown> = {}): DepartureOrder {
  return {
    id: "order-1",
    customer_id: "customer-1",
    customer_name: "Justin Edwards",
    status: "Received by Yours",
    roll_count: 1,
    received_by_yours_at: "2026-10-08T15:00:00.000Z",
    ...overrides,
  };
}

describe("formatDepartureName", () => {
  it("keeps a first name and last initial, and handles spacing, single names, and multi-word first names", () => {
    expect(formatDepartureName("Justin Edwards")).toBe("JUSTIN E.");
    expect(formatDepartureName("  justin   edwards  ")).toBe("JUSTIN E.");
    expect(formatDepartureName("Madonna")).toBe("MADONNA");
    expect(formatDepartureName("  Cher  ")).toBe("CHER");
    // Two words are first + last. Three or more keep the leading words.
    expect(formatDepartureName("Mary Ann")).toBe("MARY A.");
    expect(formatDepartureName("Mary Ann Smith")).toBe("MARY ANN S.");
    expect(formatDepartureName("  Mary\nAnn   Lee  ")).toBe("MARY ANN L.");
    expect(formatDepartureName("Jean-Luc Picard")).toBe("JEAN-LUC P.");
    expect(formatDepartureName("Sean O'Brien")).toBe("SEAN O.");
    expect(formatDepartureName("Justin Smith-Jones")).toBe("JUSTIN S.");
    expect(formatDepartureName("Maria de la Cruz")).toBe("MARIA DE LA C.");
    expect(formatDepartureName("Dr. Justin Edwards Jr.")).toBe("JUSTIN E.");
    expect(formatDepartureName("Justin II")).toBe("JUSTIN");
    expect(formatDepartureName("justin.edwards@example.com")).toBe("JUSTIN E.");
    expect(formatDepartureName("Justin 919-555-0199 Edwards")).toBe("JUSTIN E.");
    expect(formatDepartureName("<b>Justin Edwards</b>")).toBe("JUSTIN E.");
    expect(formatDepartureName("José García")).toBe("JOSÉ G.");
    expect(formatDepartureName("")).toBe("");
    expect(formatDepartureName(null)).toBe("");
    expect(formatDepartureName(42)).toBe("");
  });
});

describe("computeFilmDepartures", () => {
  it("groups by customer id, then by normalized name, with one row per person per location", () => {
    const board = computeFilmDepartures([
      order({
        id: "a",
        customer_id: "c1",
        customer_name: "Justin Edwards",
        customer_email: "justin.edwards@example.com",
        phone: "919-555-0100",
        order_number: "TMF1042",
        status: "Received by Yours",
        roll_count: 2,
        received_by_yours_at: "2026-10-08T15:00:00.000Z",
      }),
      order({
        id: "b",
        customer_id: "c1",
        customer_name: "Justin Edwards",
        status: "Received by Yours",
        roll_count: 9,
        roll_details: [{}, {}],
        received_by_yours_at: "2026-10-06T18:00:00.000Z",
      }),
      order({
        id: "c",
        customer_id: "c1",
        customer_name: "Justin Edwards",
        status: "Received at Lab",
        roll_count: 4,
        at_lab_at: "2026-10-08T14:00:00.000Z",
      }),
      order({
        id: "d",
        customer_id: "  ",
        customer_name: "Ada Lovelace",
        status: "Received by Yours",
        roll_count: 1,
        received_by_yours_at: "2026-10-08T16:00:00.000Z",
      }),
      order({
        id: "e",
        customer_id: null,
        customer_name: "ada   lovelace",
        status: "Received by Yours",
        roll_count: 3,
        dropoff_date: "2026-10-02",
        received_by_yours_at: null,
      }),
      order({
        id: "f",
        customer_id: "c2",
        customer_name: "Ada Lovelace",
        status: "Received at Lab",
        roll_count: 2,
        at_lab_at: BEFORE_TUESDAY_NOON,
      }),
      order({
        id: "g",
        customer_id: "c3",
        customer_name: "Justin Elliot",
        status: "Received by Yours",
        roll_count: 1,
        received_by_yours_at: "2026-10-08T17:00:00.000Z",
      }),
    ], NOW);

    expect(board.rows.map((row) => `${row.name}|${row.rolls}|${row.location}|${row.status}|${row.since}`)).toEqual([
      "JUSTIN E.|4|LAB|IN FLIGHT|OCT 8",
      "ADA L.|2|LAB|DEVELOPING|OCT 6",
      "JUSTIN E.|1|STUDIO|CHECKED IN|OCT 8",
      "JUSTIN E.|4|STUDIO|CHECKED IN|OCT 6",
      "ADA L.|4|STUDIO|CHECKED IN|OCT 2",
    ]);
    expect(board.people).toBe(4);
    expect(board.studioRolls).toBe(9);
    expect(board.labRolls).toBe(6);
    expect(board.nextLabRun).toBe("Friday 12:00 PM");

    const serialized = JSON.stringify(board);
    expect(serialized).not.toMatch(/Edwards|Elliot|Lovelace|justin@|example\.com|919|TMF1042/i);
  });

  it("maps studio and lab, and leaves out ready for pickup and scans sent", () => {
    const board = computeFilmDepartures([
      order({ id: "studio", status: "Received by Yours", roll_count: 2 }),
      order({
        id: "lab",
        customer_id: "c2",
        customer_name: "Mia Chen",
        status: "Received at Lab",
        roll_count: 3,
        at_lab_at: TUESDAY_NOON,
      }),
      order({ id: "pickup", customer_id: "c3", customer_name: "Ready Person", status: "Ready for Pickup", roll_count: 8 }),
      order({ id: "sent", customer_id: "c4", customer_name: "Sent Person", status: "Scans Sent", roll_count: 5 }),
      order({ id: "other", customer_id: "c5", customer_name: "Other Person", status: "Archived", roll_count: 6 }),
    ], NOW);

    expect(board.rows).toEqual([
      { name: "MIA C.", rolls: 3, location: "LAB", status: "IN FLIGHT", since: "OCT 6" },
      { name: "JUSTIN E.", rolls: 2, location: "STUDIO", status: "CHECKED IN", since: "OCT 8" },
    ]);
    expect(board.people).toBe(2);
    expect(board.studioRolls).toBe(2);
    expect(board.labRolls).toBe(3);
    expect(JSON.stringify(board)).not.toMatch(/Ready Person|Sent Person|Other Person/);
  });

  it("counts every roll on the order, including develop-only rolls", () => {
    const board = computeFilmDepartures([
      order({
        roll_count: 9,
        roll_details: [
          { scan_size: "Process Only" },
          { scan_size: "Process Only" },
          { scan_size: "Standard" },
        ],
      }),
    ], NOW);
    expect(board.rows[0]?.rolls).toBe(3);
    expect(board.studioRolls).toBe(3);
  });

  it("calls lab film from the latest run in flight, and older lab film developing", () => {
    const board = computeFilmDepartures([
      order({
        id: "fresh",
        customer_id: "fresh",
        customer_name: "Fresh Film",
        status: "Received at Lab",
        at_lab_at: TUESDAY_NOON,
      }),
      order({
        id: "older",
        customer_id: "older",
        customer_name: "Older Film",
        status: "Received at Lab",
        at_lab_at: BEFORE_TUESDAY_NOON,
      }),
    ], NOW);
    expect(board.rows.map((row) => [row.name, row.status])).toEqual([
      ["FRESH F.", "IN FLIGHT"],
      ["OLDER F.", "DEVELOPING"],
    ]);
  });

  it("formats since in America/New_York, including just before midnight", () => {
    const board = computeFilmDepartures([
      order({
        received_by_yours_at: "2026-10-07T03:30:00.000Z",
      }),
    ], NOW);
    expect(board.rows[0]?.since).toBe("OCT 6");

    const winter = computeFilmDepartures([
      order({
        received_by_yours_at: "2026-01-16T04:30:00.000Z",
      }),
    ], new Date("2026-01-16T16:30:00.000Z"));
    expect(winter.rows[0]?.since).toBe("JAN 15");
  });

  it("returns an empty board with the next lab run when nobody is in process", () => {
    const board = computeFilmDepartures([
      order({ status: "Scans Sent", customer_name: "Nobody Home" }),
    ], NOW);
    expect(board.rows).toEqual([]);
    expect(board.people).toBe(0);
    expect(board.studioRolls).toBe(0);
    expect(board.labRolls).toBe(0);
    expect(board.nextLabRun).toBe("Friday 12:00 PM");
    expect(JSON.stringify(board)).not.toMatch(/Nobody/);
  });
});

describe("sanitizeFilmDepartures", () => {
  it("reduces a full name and drops emails, phones, and order numbers", () => {
    const clean = sanitizeFilmDepartures({
      rows: [{
        name: "Justin Edwards",
        rolls: 2,
        location: "STUDIO",
        status: "CHECKED IN",
        since: "OCT 6",
        email: "justin.edwards@example.com",
        phone: "919-555-0100",
        order_number: "TMF1042",
      }],
      people: 1,
      studioRolls: 2,
      labRolls: 0,
      nextLabRun: "Friday 12:00 PM",
      customer_email: "secret@example.com",
    });
    expect(clean).toEqual({
      rows: [{ name: "JUSTIN E.", rolls: 2, location: "STUDIO", status: "CHECKED IN", since: "OCT 6" }],
      people: 1,
      studioRolls: 2,
      labRolls: 0,
      nextLabRun: "Friday 12:00 PM",
    });
    expect(JSON.stringify(clean)).not.toMatch(/Edwards|example\.com|919|TMF/);
  });

  it("drops a row whose status does not match its location", () => {
    const clean = sanitizeFilmDepartures({
      rows: [{ name: "JUSTIN E.", rolls: 1, location: "STUDIO", status: "IN FLIGHT", since: "OCT 6" }],
      people: 1,
      studioRolls: 1,
      labRolls: 0,
      nextLabRun: "Friday 12:00 PM",
    });
    expect(clean?.rows).toEqual([]);
  });
});

describe("departure order select", () => {
  it("asks only for board columns", () => {
    expect(DEPARTURE_ORDER_SELECT.split(", ").sort()).toEqual([
      "at_lab_at",
      "created_at",
      "customer_id",
      "customer_name",
      "dropoff_date",
      "id",
      "received_by_yours_at",
      "roll_count",
      "roll_details",
      "status",
      "status_updated_at",
    ]);
    expect(DEPARTURE_ORDER_SELECT).not.toMatch(/email|phone|order_number|notes|wetransfer|history/i);
  });
});
