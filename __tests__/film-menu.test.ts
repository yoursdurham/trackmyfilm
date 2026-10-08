import { describe, expect, it } from "vitest";
import { FILM_MENU_SEED, sanitizeFilmMenu } from "@/lib/film-menu";
import { publicPayloadForDisplay } from "@/lib/display";

describe("film menu seed", () => {
  it("matches the standalone menu, including both expired rolls", () => {
    const menu = sanitizeFilmMenu(FILM_MENU_SEED);
    expect(menu?.title).toBe("YOUR'S FILM MENU");
    expect(menu?.subtitle).toBe("Durham, North Carolina");
    expect(menu?.banner).toEqual([
      "35MM / 120 / POLAROID / DISPOSABLES",
      "PRICES SUBJECT TO CHANGE",
    ]);
    expect(menu?.sections.map((section) => [section.title, section.items.length])).toEqual([
      ["35MM FILM", 35],
      ["120 FILM", 13],
      ["POLAROID + DISPOSABLES", 10],
    ]);
    expect(menu?.sections[0].items[0]).toEqual({ name: "All Reflx Labs 35mm", price: "$18" });
    expect(menu?.sections[0].items[1]).toEqual({ name: "Arista EDU Ultra 100 - 35mm", price: "$8.50" });
    expect(menu?.sections[2].items[0]).toEqual({ name: "Kodak FunSaver", price: "$21" });
    const expired = menu?.sections.flatMap((section) =>
      section.items.filter((item) => item.name === "Expired 35mm/120 Roll"));
    expect(expired).toEqual([
      { name: "Expired 35mm/120 Roll", price: "$7" },
      { name: "Expired 35mm/120 Roll", price: "$7" },
    ]);
    expect(menu?.notes).toEqual([
      { text: "Ask us about film processing + scanning" },
      { text: "YOURSDURHAM.COM / @YOURSDURHAM" },
      { text: "Please rewind your film." },
      { text: "FILM PROCESSING", heading: true },
      { text: "FILM IS DROPPED OFF AT THE LAB TUESDAYS + FRIDAYS AT NOON" },
      { text: "TRACK YOUR FILM", heading: true },
      { text: "TRACK YOUR FILM STATUS AT TRACKMYFILM.COM" },
    ]);
  });
});

describe("sanitizeFilmMenu", () => {
  it("drops tags, blank items, and anything that is not menu content", () => {
    const menu = sanitizeFilmMenu({
      title: "Menu <b>x</b>",
      subtitle: "Durham",
      banner: ["LINE"],
      customer_email: "secret@example.com",
      revenue: 40,
      sections: [{
        title: "35MM <i>FILM</i>",
        privateNotes: "hidden",
        items: [
          { name: "Kodak Gold <script>", price: "$12", email: "secret@example.com" },
          { name: "   ", price: "$2" },
        ],
      }],
      notes: ["Please rewind your film.", { text: "TRACK YOUR FILM", heading: true, phone: "555" }],
    });

    expect(menu).toEqual({
      title: "Menu x",
      subtitle: "Durham",
      banner: ["LINE"],
      sections: [{
        title: "35MM FILM",
        items: [{ name: "Kodak Gold", price: "$12" }],
      }],
      notes: [
        { text: "Please rewind your film." },
        { text: "TRACK YOUR FILM", heading: true },
      ],
    });
    expect(JSON.stringify(menu)).not.toMatch(/secret@|hidden|555|revenue/);
  });
});

describe("film menu display payload", () => {
  it("returns the crt-green theme and only the menu", () => {
    const payload = publicPayloadForDisplay(
      {
        mode: "film_menu",
        theme: "yours-clean",
        is_enabled: true,
        override_mode: null,
        override_payload: null,
      },
      {
        menu: {
          ...FILM_MENU_SEED,
          customer_email: "secret@example.com",
        },
        film: { rollsProcessing: 4, revenue: 90, email: "lab@example.com" },
      },
    );

    expect(payload.theme).toBe("crt-green");
    expect(payload.mode).toBe("film_menu");
    expect(payload.data.menu).toEqual(FILM_MENU_SEED);
    expect(JSON.stringify(payload)).not.toMatch(/secret@|lab@|revenue/);
    expect(Object.keys(payload.data)).toEqual(["menu"]);
  });
});
