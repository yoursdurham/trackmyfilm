import { describe, it, expect } from "vitest";
import { ORDER_STATUS, STATUS_FLOW, STATUS_TEMPLATE_MAP } from "../lib/constants";

describe("STATUS_FLOW ordering", () => {
  it("has exactly 3 statuses", () => {
    expect(STATUS_FLOW).toHaveLength(3);
  });

  it("starts with Received by Yours", () => {
    expect(STATUS_FLOW[0]).toBe("Received by Yours");
  });

  it("has Received at Lab in the middle", () => {
    expect(STATUS_FLOW[1]).toBe("Received at Lab");
  });

  it("ends with Scans Sent", () => {
    expect(STATUS_FLOW[2]).toBe("Scans Sent");
  });

  it("matches ORDER_STATUS constants", () => {
    expect(STATUS_FLOW[0]).toBe(ORDER_STATUS.RECEIVED_BY_YOURS);
    expect(STATUS_FLOW[1]).toBe(ORDER_STATUS.RECEIVED_AT_LAB);
    expect(STATUS_FLOW[2]).toBe(ORDER_STATUS.SCANS_SENT);
  });
});

describe("STATUS_TEMPLATE_MAP", () => {
  it("maps every status in STATUS_FLOW to a template name", () => {
    for (const status of STATUS_FLOW) {
      expect(STATUS_TEMPLATE_MAP[status]).toBeDefined();
    }
  });

  it("uses the correct template names", () => {
    expect(STATUS_TEMPLATE_MAP["Received by Yours"]).toBe("film_drop_received");
    expect(STATUS_TEMPLATE_MAP["Received at Lab"]).toBe("film_at_lab");
    expect(STATUS_TEMPLATE_MAP["Scans Sent"]).toBe("scans_sent");
  });
});
