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
  it("groups by customer id, then by normalized name, with departures and arrivals kept apart", () => {
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

    expect(board.departures.map((row) => `${row.name}|${row.rolls}|${row.gate}|${row.status}|${row.time}|${row.destination}`)).toEqual([
      "ADA L.|4|OCT 2|CHECKED IN|12:00|LAB",
      "JUSTIN E.|4|OCT 6|CHECKED IN|12:00|LAB",
      "JUSTIN E.|1|OCT 8|CHECKED IN|12:00|LAB",
    ]);
    expect(board.arrivals.map((row) => `${row.name}|${row.rolls}|${row.expected}|${row.status}|${row.from}`)).toEqual([
      "ADA L.|2|--|IN FLIGHT|LAB",
      "JUSTIN E.|4|--|IN FLIGHT|LAB",
    ]);
    expect(board.people).toBe(4);
    expect(board.studioRolls).toBe(9);
    expect(board.labRolls).toBe(6);
    expect(board.landedRolls).toBe(0);
    expect(board.nextLabRun).toBe("FRI 12:00 PM");
    expect(board.departureTime).toBe("12:00");

    const serialized = JSON.stringify(board);
    expect(serialized).not.toMatch(/Edwards|Elliot|Lovelace|justin@|example\.com|919|TMF1042|order-/i);
    expect(board.departures[0] && "order_number" in board.departures[0]).toBe(false);
  });

  it("maps studio and lab, and leaves out ready for pickup and older scans sent", () => {
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
      order({
        id: "sent",
        customer_id: "c4",
        customer_name: "Sent Person",
        status: "Scans Sent",
        roll_count: 5,
        scans_sent_at: "2026-10-07T15:00:00.000Z",
      }),
      order({ id: "other", customer_id: "c5", customer_name: "Other Person", status: "Archived", roll_count: 6 }),
    ], NOW);

    expect(board.departures).toEqual([
      { time: "12:00", destination: "LAB", name: "JUSTIN E.", rolls: 2, gate: "OCT 8", status: "CHECKED IN" },
    ]);
    expect(board.arrivals).toEqual([
      { from: "LAB", name: "MIA C.", rolls: 3, expected: "--", status: "IN FLIGHT" },
    ]);
    expect(board.people).toBe(2);
    expect(board.studioRolls).toBe(2);
    expect(board.labRolls).toBe(3);
    expect(board.landedRolls).toBe(0);
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
    expect(board.departures[0]?.rolls).toBe(3);
    expect(board.studioRolls).toBe(3);
  });

  it("estimates the scans date from the lab date plus the turnaround average, and marks a late order delayed", () => {
    const averages = { colorDays: 4.2, bwDays: 3 };
    const board = computeFilmDepartures([
      order({
        id: "color",
        customer_id: "color",
        customer_name: "Fresh Film",
        status: "Received at Lab",
        film_process: "Color",
        at_lab_at: TUESDAY_NOON,
      }),
      order({
        id: "bw",
        customer_id: "bw",
        customer_name: "Older Film",
        status: "Received at Lab",
        film_process: "Black & White",
        at_lab_at: "2026-09-01T16:00:00.000Z",
      }),
      order({
        id: "unknown",
        customer_id: "unknown",
        customer_name: "Mixed Film",
        status: "Received at Lab",
        film_process: "Other",
        at_lab_at: TUESDAY_NOON,
      }),
    ], NOW, averages);

    expect(board.arrivals.map((row) => [row.name, row.expected, row.status])).toEqual([
      ["OLDER F.", "SEP 4", "DELAYED"],
      ["FRESH F.", "OCT 11", "IN FLIGHT"],
      ["MIXED F.", "OCT 11", "IN FLIGHT"],
    ]);
  });

  it("leaves the expected date blank when there is no turnaround average", () => {
    const board = computeFilmDepartures([
      order({
        customer_id: "lab",
        customer_name: "Mia Chen",
        status: "Received at Lab",
        film_process: "Color",
        at_lab_at: "2026-09-01T16:00:00.000Z",
      }),
    ], NOW);
    expect(board.arrivals).toEqual([
      { from: "LAB", name: "MIA C.", rolls: 1, expected: "--", status: "IN FLIGHT" },
    ]);
  });

  it("uses color or black and white averages, and the later of the two for a mixed order", () => {
    const colorOnly = computeFilmDepartures([
      order({
        status: "Received at Lab",
        film_process: "Color",
        at_lab_at: TUESDAY_NOON,
      }),
    ], NOW, { colorDays: null, bwDays: 6 });
    expect(colorOnly.arrivals[0]?.expected).toBe("--");

    const mixed = computeFilmDepartures([
      order({
        status: "Received at Lab",
        film_process: "Both",
        at_lab_at: TUESDAY_NOON,
      }),
    ], NOW, { colorDays: 4, bwDays: 6.1 });
    expect(mixed.arrivals[0]?.expected).toBe("OCT 13");
  });

  it("keeps scans sent today as landed, and leaves yesterday off the board", () => {
    const board = computeFilmDepartures([
      order({
        id: "today",
        customer_id: "today",
        customer_name: "Lana Day",
        status: "Scans Sent",
        roll_count: 2,
        scans_sent_at: "2026-10-08T15:00:00.000Z",
        at_lab_at: TUESDAY_NOON,
        film_process: "Color",
      }),
      order({
        id: "yesterday",
        customer_id: "yesterday",
        customer_name: "Yara Old",
        status: "Scans Sent",
        scans_sent_at: "2026-10-07T15:00:00.000Z",
      }),
      order({
        id: "history",
        customer_id: "history",
        customer_name: "Hope Story",
        status: "Scans Sent",
        scans_sent_at: null,
        received_by_yours_at: null,
        dropoff_date: null,
        created_at: null,
        status_updated_at: null,
        status_history: [{ status: "Scans Sent", changed_at: "2026-10-08T18:00:00.000Z" }],
      }),
      order({
        id: "same",
        customer_id: "today",
        customer_name: "Lana Day",
        status: "Received at Lab",
        roll_count: 1,
        at_lab_at: "2026-10-08T14:00:00.000Z",
      }),
    ], NOW, { colorDays: 4, bwDays: null });

    expect(board.arrivals.map((row) => `${row.name}|${row.rolls}|${row.status}|${row.expected}`)).toEqual([
      "LANA D.|2|LANDED|OCT 10",
      "HOPE S.|1|LANDED|--",
      "LANA D.|1|IN FLIGHT|OCT 12",
    ]);
    expect(board.landedRolls).toBe(3);
    expect(board.labRolls).toBe(1);
    expect(JSON.stringify(board)).not.toMatch(/Yara|yesterday/);
  });

  it("calls the gate final when today's lab run is close, and checked in otherwise", () => {
    const fridayMorning = new Date("2026-10-09T14:00:00.000Z");
    const boarding = computeFilmDepartures([
      order({ received_by_yours_at: "2026-10-09T13:00:00.000Z" }),
    ], fridayMorning);
    expect(boarding.departures[0]?.status).toBe("BOARDING");
    expect(boarding.nextLabRun).toBe("FRI 12:00 PM");

    const finalCall = computeFilmDepartures([order()], new Date("2026-10-09T15:40:00.000Z"));
    expect(finalCall.departures[0]?.status).toBe("FINAL CALL");

    const onTheHour = computeFilmDepartures([order()], new Date("2026-10-09T13:00:00.000Z"));
    expect(onTheHour.departures[0]?.status).toBe("BOARDING");

    const earlier = computeFilmDepartures([order()], new Date("2026-10-09T12:59:00.000Z"));
    expect(earlier.departures[0]?.status).toBe("CHECKED IN");

    const afterNoon = computeFilmDepartures([order()], new Date("2026-10-09T16:01:00.000Z"));
    expect(afterNoon.departures[0]?.status).toBe("CHECKED IN");
    expect(afterNoon.nextLabRun).toBe("TUE 12:00 PM");
  });

  it("formats the gate in America/New_York, including just before midnight, or Y1 when the date is missing", () => {
    const board = computeFilmDepartures([
      order({ received_by_yours_at: "2026-10-07T03:30:00.000Z" }),
    ], NOW);
    expect(board.departures[0]?.gate).toBe("OCT 6");

    const winter = computeFilmDepartures([
      order({ received_by_yours_at: "2026-01-16T04:30:00.000Z" }),
    ], new Date("2026-01-16T16:30:00.000Z"));
    expect(winter.departures[0]?.gate).toBe("JAN 15");

    const undated = computeFilmDepartures([
      order({
        received_by_yours_at: null,
        dropoff_date: null,
        created_at: null,
        status_updated_at: null,
      }),
    ], NOW);
    expect(undated.departures[0]?.gate).toBe("Y1");
  });

  it("returns an empty board with the next lab run when nobody is in process", () => {
    const board = computeFilmDepartures([
      order({ status: "Scans Sent", customer_name: "Nobody Home", scans_sent_at: "2026-10-01T15:00:00.000Z" }),
    ], NOW);
    expect(board.departures).toEqual([]);
    expect(board.arrivals).toEqual([]);
    expect(board.people).toBe(0);
    expect(board.studioRolls).toBe(0);
    expect(board.labRolls).toBe(0);
    expect(board.landedRolls).toBe(0);
    expect(board.nextLabRun).toBe("FRI 12:00 PM");
    expect(JSON.stringify(board)).not.toMatch(/Nobody/);
  });
});

describe("sanitizeFilmDepartures", () => {
  it("reduces a full name and drops emails, phones, and order numbers", () => {
    const clean = sanitizeFilmDepartures({
      departures: [{
        time: "12:00",
        destination: "LAB",
        name: "Justin Edwards",
        rolls: 2,
        gate: "OCT 6",
        status: "CHECKED IN",
        email: "justin.edwards@example.com",
        phone: "919-555-0100",
        order_number: "TMF1042",
        flight: "YD 1042",
      }],
      arrivals: [{
        from: "LAB",
        name: "Mia Chen",
        rolls: 1,
        expected: "OCT 13",
        status: "IN FLIGHT",
        id: "order-secret",
      }],
      people: 2,
      studioRolls: 2,
      labRolls: 1,
      landedRolls: 0,
      nextLabRun: "FRI 12:00 PM",
      departureTime: "12:00",
      customer_email: "secret@example.com",
    });
    expect(clean).toEqual({
      departures: [{ time: "12:00", destination: "LAB", name: "JUSTIN E.", rolls: 2, gate: "OCT 6", status: "CHECKED IN" }],
      arrivals: [{ from: "LAB", name: "MIA C.", rolls: 1, expected: "OCT 13", status: "IN FLIGHT" }],
      people: 2,
      studioRolls: 2,
      labRolls: 1,
      landedRolls: 0,
      nextLabRun: "FRI 12:00 PM",
      departureTime: "12:00",
    });
    expect(JSON.stringify(clean)).not.toMatch(/Edwards|Chen|example\.com|919|TMF|order-secret|YD 1042/);
  });

  it("drops a row that is not a lab flight or carries the wrong status", () => {
    const clean = sanitizeFilmDepartures({
      departures: [{ time: "12:00", destination: "STUDIO", name: "JUSTIN E.", rolls: 1, gate: "OCT 6", status: "CHECKED IN" }],
      arrivals: [{ from: "LAB", name: "JUSTIN E.", rolls: 1, expected: "OCT 6", status: "CHECKED IN" }],
      people: 1,
      studioRolls: 1,
      labRolls: 0,
      landedRolls: 0,
      nextLabRun: "FRI 12:00 PM",
      departureTime: "12:00",
    });
    expect(clean?.departures).toEqual([]);
    expect(clean?.arrivals).toEqual([]);
  });
});

describe("departure order select", () => {
  it("asks only for board columns", () => {
    expect(DEPARTURE_ORDER_SELECT.split(", ").sort()).toEqual([
      "at_lab_at",
      "bw_scans_delivered_at",
      "color_scans_delivered_at",
      "created_at",
      "customer_id",
      "customer_name",
      "dropoff_date",
      "film_process",
      "id",
      "received_by_yours_at",
      "roll_count",
      "roll_details",
      "scans_sent_at",
      "status",
      "status_history",
      "status_updated_at",
    ]);
    expect(DEPARTURE_ORDER_SELECT).not.toMatch(/email|phone|order_number|notes|wetransfer/i);
  });
});
