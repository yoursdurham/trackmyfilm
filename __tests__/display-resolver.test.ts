import { describe, expect, it } from "vitest";
import {
  DISPLAY_ONLINE_WINDOW_MS,
  DISPLAY_PRIORITY,
  isDisplayOnline,
  publicPayloadForDisplay,
  resolveDisplayState,
  sanitizeCustomMessage,
  toPublicDisplayPayload,
  type DisplayResolveInput,
} from "../lib/display";
import { DEFAULT_STUDIO_CHECKOUT_LINES, DEFAULT_STUDIO_INFO_LINES } from "../lib/studio-info";

const display = {
  mode: "idle",
  theme: "yours-clean",
  is_enabled: true,
  override_mode: null,
  override_payload: null,
};

function resolve(extras: Partial<DisplayResolveInput> = {}) {
  return resolveDisplayState({ display, ...extras });
}

const session = {
  firstName: "Jessica",
  sessionType: "Studio Rental",
  start: "2:00 PM",
  end: "5:00 PM",
  email: "jessica@example.com",
  phone: "919-555-0100",
  privateNotes: "bring the backdrop",
  price: 180,
};

describe("resolveDisplayState", () => {
  it("uses the branded default when nothing else is scheduled", () => {
    const result = resolve();
    expect(result).toMatchObject({
      mode: "idle",
      theme: "yours-clean",
      refreshSeconds: 30,
      priority: DISPLAY_PRIORITY.playlistOrDefault,
      data: {},
    });
  });

  it("lets a custom-message override beat an active studio session", () => {
    const result = resolve({
      display: {
        ...display,
        override_mode: "custom_message",
        override_payload: { message: "  Back in 10 minutes  " },
      },
      studio: { active: session },
    });
    expect(result.mode).toBe("custom_message");
    expect(result.priority).toBe(DISPLAY_PRIORITY.override);
    expect(result.data).toEqual({ message: "Back in 10 minutes" });
  });

  it("falls through a blank custom message to the next state", () => {
    const result = resolve({
      display: {
        ...display,
        override_mode: "custom_message",
        override_payload: { message: "   <br>  " },
      },
      studio: { welcome: session },
    });
    expect(result.mode).toBe("studio_welcome");
    expect(result.priority).toBe(DISPLAY_PRIORITY.studioWelcome);
  });

  it("prefers the active session over welcome and upcoming", () => {
    const result = resolve({
      studio: {
        active: session,
        welcome: { ...session, firstName: "Soon" },
        upcoming: { ...session, firstName: "Later" },
      },
    });
    expect(result.mode).toBe("studio_active");
    expect(result.priority).toBe(DISPLAY_PRIORITY.studioActive);
    expect(result.data).toEqual({
      firstName: "Jessica",
      sessionType: "Studio Rental",
      start: "2:00 PM",
      end: "5:00 PM",
      infoLines: [...DEFAULT_STUDIO_INFO_LINES],
    });
    expect(result.data).not.toHaveProperty("checkoutLines");
  });

  it("prefers the ending-soon window over a plain active session", () => {
    const result = resolve({
      studio: {
        active: session,
        endingSoon: { ...session, firstName: "Jessica" },
        upcoming: session,
      },
    });
    expect(result.mode).toBe("studio_ending_soon");
    expect(result.data.firstName).toBe("Jessica");
    expect(result.data.checkoutLines).toEqual([...DEFAULT_STUDIO_CHECKOUT_LINES]);
    expect(result.data).not.toHaveProperty("infoLines");
  });

  it("prefers welcome over upcoming, and upcoming over the default mode", () => {
    const welcome = resolve({ studio: { welcome: session, upcoming: session } });
    expect(welcome.mode).toBe("studio_welcome");
    expect(welcome.data.infoLines).toEqual([...DEFAULT_STUDIO_INFO_LINES]);
    expect(welcome.data).not.toHaveProperty("checkoutLines");
    const upcoming = resolve({ studio: { upcoming: session } });
    expect(upcoming.mode).toBe("studio_upcoming");
    expect(upcoming.priority).toBe(DISPLAY_PRIORITY.studioUpcoming);
    expect(upcoming.data).not.toHaveProperty("infoLines");
    expect(upcoming.data).not.toHaveProperty("checkoutLines");
  });

  it("uses the screen's info and checkout lines and leaves door codes off the payload", () => {
    const welcome = resolve({
      display: {
        ...display,
        studio_info_lines: ["Wi-Fi: Guest, password hello", "<b>Bathrooms</b> down the hall"],
        studio_checkout_lines: ["Lock the door"],
      },
      studio: { welcome: { ...session, doorCode: "4821", parking: "the gravel lot" } },
    });
    expect(welcome.data.infoLines).toEqual([
      "Wi-Fi: Guest, password hello",
      "Bathrooms down the hall",
    ]);
    expect(JSON.stringify(welcome.data)).not.toMatch(/4821|gravel/);

    const ending = resolve({
      display: {
        ...display,
        studio_info_lines: ["Wi-Fi: Guest, password hello"],
        studio_checkout_lines: ["Lock the door"],
      },
      studio: { endingSoon: session },
    });
    expect(ending.data.checkoutLines).toEqual(["Lock the door"]);
    expect(ending.data).not.toHaveProperty("infoLines");

    const cleared = resolve({
      display: { ...display, studio_info_lines: [] },
      studio: { active: session },
    });
    expect(cleared.mode).toBe("studio_active");
    expect(cleared.data).not.toHaveProperty("infoLines");
  });

  it("plays an enabled playlist item instead of the stored default mode", () => {
    const result = resolve({
      playlist: {
        activeIndex: 1,
        items: [
          { mode: "film_stats", enabled: false },
          { mode: "film_stats", durationSeconds: 15 },
        ],
      },
      film: { rollsProcessing: 12, revenue: 400, email: "lab@example.com" },
    });
    expect(result.mode).toBe("film_stats");
    expect(result.priority).toBe(DISPLAY_PRIORITY.playlistOrDefault);
    expect(result.data).toEqual({ rollsProcessing: 12 });
  });

  it("ignores overrides and studio data when the screen is disabled", () => {
    const result = resolve({
      display: {
        ...display,
        is_enabled: false,
        override_mode: "custom_message",
        override_payload: { message: "Closed" },
      },
      studio: { active: session },
    });
    expect(result.mode).toBe("idle");
    expect(result.data).toEqual({});
  });

  it("shows film stats from the default mode and drops anything that is not a metric", () => {
    const result = resolve({
      display: { ...display, mode: "film_stats" },
      film: {
        rollsProcessing: 8,
        receivedToday: 2,
        receivedThisWeek: 6,
        scansSentToday: 1,
        scansSentThisWeek: 4,
        averageColorTurnaroundDays: 5.5,
        averageBwTurnaroundDays: null,
        nextLabRun: "Friday 12:00 PM",
        revenue: 400,
        email: "lab@example.com",
        customer_name: "Ada",
      },
    });

    expect(result.mode).toBe("film_stats");
    expect(result.data).toEqual({
      rollsProcessing: 8,
      receivedToday: 2,
      receivedThisWeek: 6,
      scansSentToday: 1,
      scansSentThisWeek: 4,
      averageColorTurnaroundDays: 5.5,
      averageBwTurnaroundDays: null,
      nextLabRun: "Friday 12:00 PM",
    });
  });

  it("strips tags and control characters from a custom message", () => {
    expect(sanitizeCustomMessage("Hello <script>alert(1)</script>\n\n\nthere")).toBe(
      "Hello alert(1)\n\nthere",
    );
    expect(sanitizeCustomMessage(42)).toBe("");
    expect(sanitizeCustomMessage("x".repeat(400)).length).toBe(280);
  });
});

describe("toPublicDisplayPayload", () => {
  it("returns only mode, theme, refreshSeconds, and whitelisted data", () => {
    const dirty = {
      mode: "film_stats",
      theme: "yours-clean",
      refreshSeconds: 30,
      priority: 10,
      email: "secret@example.com",
      phone: "555",
      data: {
        rollsProcessing: 4,
        rollsProcessingNote: "secret@example.com",
        nextLabRun: "Friday 12:00 PM",
        averageBwTurnaroundDays: null,
        averageColorTurnaroundDays: "fast",
        email: "secret@example.com",
        revenue: 900,
        privateNotes: "do not show",
      },
    };
    const payload = toPublicDisplayPayload(dirty);

    expect(Object.keys(payload).sort()).toEqual(["data", "mode", "refreshSeconds", "theme"]);
    expect(payload).toEqual({
      mode: "film_stats",
      theme: "yours-clean",
      refreshSeconds: 30,
      data: {
        rollsProcessing: 4,
        nextLabRun: "Friday 12:00 PM",
        averageBwTurnaroundDays: null,
      },
    });
    expect(JSON.stringify(payload)).not.toMatch(/secret@|555|900|do not show/);
  });

  it("drops private booking fields even when the override payload is full of them", () => {
    const payload = publicPayloadForDisplay(
      {
        ...display,
        override_mode: "custom_message",
        override_payload: {
          message: "Hello <b>there</b>",
          email: "a@b.com",
          phone: "555-1212",
          private_notes: "secret",
          price: 100,
        },
      },
      {
        studio: { active: session },
        film: { rollsProcessing: 3, revenue: 50, email: "lab@example.com" },
      },
    );

    expect(payload).toEqual({
      mode: "custom_message",
      theme: "yours-clean",
      refreshSeconds: 30,
      data: { message: "Hello there" },
    });
    expect(JSON.stringify(payload)).not.toMatch(/a@b.com|555|secret|lab@|jessica@|180/);
    expect(payload.data.message).not.toMatch(/[<>]/);
  });

  it("sends studio info lines only on welcome and active, and checkout lines only when ending", () => {
    const welcome = toPublicDisplayPayload({
      mode: "studio_welcome",
      theme: "yours-clean",
      refreshSeconds: 30,
      data: {
        firstName: "Faith",
        sessionType: "1 Hour Session",
        start: "2:00 PM",
        end: "3:00 PM",
        infoLines: ["Wi-Fi: Trinity Design Build 5G, password Trinity64", { doorCode: "4821" }],
        checkoutLines: ["Please put furniture back where it was"],
        doorCode: "4821",
        parking: "the gravel lot behind the bakery",
        description: "Phone: 919-555-0148",
      },
    });
    expect(welcome.data.infoLines).toEqual(["Wi-Fi: Trinity Design Build 5G, password Trinity64"]);
    expect(welcome.data).not.toHaveProperty("checkoutLines");
    expect(JSON.stringify(welcome)).not.toMatch(/4821|gravel|919-555-0148/);

    const ending = toPublicDisplayPayload({
      mode: "studio_ending_soon",
      theme: "yours-clean",
      refreshSeconds: 30,
      data: {
        firstName: "Faith",
        end: "3:00 PM",
        infoLines: ["Wi-Fi: Trinity Design Build 5G, password Trinity64"],
        checkoutLines: ["Please put furniture back where it was", "Press the lock on the door on your way out."],
        doorCode: "4821",
      },
    });
    expect(ending.data.checkoutLines).toEqual([
      "Please put furniture back where it was",
      "Press the lock on the door on your way out.",
    ]);
    expect(ending.data).not.toHaveProperty("infoLines");
    expect(JSON.stringify(ending)).not.toMatch(/4821|Trinity64/);
  });
});

describe("isDisplayOnline", () => {
  it("is online inside the check-in window and offline after it", () => {
    const now = Date.parse("2026-10-08T16:00:00.000Z");
    expect(isDisplayOnline(new Date(now - DISPLAY_ONLINE_WINDOW_MS).toISOString(), now)).toBe(true);
    expect(isDisplayOnline(new Date(now - DISPLAY_ONLINE_WINDOW_MS - 1).toISOString(), now)).toBe(false);
    expect(isDisplayOnline(null, now)).toBe(false);
  });
});
