import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DisplayPlayer from "../components/display/DisplayPlayer";
import FilmDeparturesBoard from "../components/display/FilmDeparturesBoard";
import YoursCleanScreen from "../components/display/YoursCleanScreen";
import type { DisplayPayload } from "../lib/display";
import { adminPreviewFrame, departuresLayout, departureRowsPerPage } from "../lib/display-layout";
import type { FilmDepartures } from "../lib/film-departures";

const migration = readFileSync("supabase/migrations/023_front_window_display.sql", "utf8");

function departure(index: number) {
  return {
    time: "12:00",
    destination: "LAB" as const,
    name: `GUEST ${String.fromCharCode(65 + index)}.`,
    rolls: 1,
    gate: "Y1",
    status: "CHECKED IN" as const,
  };
}

function board(count: number): FilmDepartures {
  return {
    departures: Array.from({ length: count }, (_, index) => departure(index)),
    arrivals: [],
    nextLabRun: "TUE 12:00 PM",
    departureTime: "12:00",
    people: count,
    studioRolls: count,
    labRolls: 0,
    landedRolls: 0,
  };
}

function payload(mode: string, data: Record<string, unknown> = {}, theme = "yours-clean"): DisplayPayload {
  return { mode, theme, refreshSeconds: 30, buildId: "dev", data };
}

function names(html: string) {
  return html.match(/data-board-field="name"/g)?.length ?? 0;
}

describe("front window migration", () => {
  it("inserts the landscape screen once and does not overwrite it later", () => {
    expect(migration).toMatch(/insert into displays/i);
    expect(migration).toMatch(/'front-window'/);
    expect(migration).toMatch(/'Front window'/);
    expect(migration).toMatch(/'landscape'/);
    expect(migration).toMatch(/'1920x1080'/);
    expect(migration).toMatch(/'idle'/);
    expect(migration).toMatch(/true/);
    expect(migration).toMatch(/on conflict \(slug\) do nothing/i);
    expect(migration).not.toMatch(/on conflict \(slug\) do update/i);
  });
});

describe("display preview frames", () => {
  it("keeps the studio preview at 1080 by 3840", () => {
    expect(adminPreviewFrame({ orientation: "portrait", resolution: "1080x3840" })).toMatchObject({
      width: 1080,
      height: 3840,
      frameHeight: 640,
      label: "1080 × 3840 preview",
    });
    expect(adminPreviewFrame({ orientation: "portrait", resolution: "1920x1080" }).width).toBe(1080);
  });

  it("previews the front window at its landscape resolution, including 2560 by 1440", () => {
    const hd = adminPreviewFrame({ orientation: "landscape", resolution: "1920x1080" });
    expect(hd).toMatchObject({ width: 1920, height: 1080, label: "1920 × 1080 preview" });
    expect(hd.frameWidth / hd.frameHeight).toBeCloseTo(16 / 9, 5);

    const qhd = adminPreviewFrame({ orientation: "landscape", resolution: "2560x1440" });
    expect(qhd).toMatchObject({ width: 2560, height: 1440 });
    expect(qhd.frameWidth / qhd.frameHeight).toBeCloseTo(2560 / 1440, 5);
    expect(qhd.frameWidth).toBeLessThanOrEqual(720);
  });
});

describe("landscape display rendering", () => {
  const nine = board(9);
  const departures = payload("film_departures", { departures: nine }, "airport");

  it("stacks the studio airport board and keeps its dead zone", () => {
    expect(departuresLayout("portrait")).toBe("stacked");
    expect(departureRowsPerPage("portrait")).toBe(8);

    const portraitBoard = renderToStaticMarkup(<FilmDeparturesBoard board={nine} />);
    expect(portraitBoard).toContain("Departures → Lab");
    expect(portraitBoard).toContain("Arrivals ← Lab");
    expect(portraitBoard).not.toContain("data-departures-layout=\"side-by-side\"");
    expect(names(portraitBoard)).toBe(8);

    const studio = renderToStaticMarkup(
      <DisplayPlayer slug="studio-vertical" orientation="portrait" initial={departures} loadedBuildId="dev" preview />,
    );
    expect(studio).toContain("data-display-orientation=\"portrait\"");
    expect(studio).toContain("data-display-safe-inset=\"222\"");
    expect(studio).toContain("data-display-deadzone");
    expect(studio).toContain("Departures → Lab");
    expect(studio).not.toContain("data-display-chrome=\"tmf\"");
    expect(studio).not.toContain("data-departures-layout=\"side-by-side\"");
  });

  it("keeps the studio stats inset and the portrait stats stack", () => {
    const stats = payload("film_stats", { rollsProcessing: 12, receivedToday: 3 });
    const studio = renderToStaticMarkup(
      <DisplayPlayer slug="studio-vertical" orientation="portrait" initial={stats} loadedBuildId="dev" preview />,
    );
    expect(studio).toContain("data-display-safe-inset=\"215\"");
    expect(studio).toContain("data-stat=\"rolls-processing\"");
    expect(studio).not.toContain("data-stats-layout=\"landscape\"");
    expect(studio).not.toContain("data-display-chrome=\"tmf\"");
  });

  it("puts departures and arrivals side by side on the front window", () => {
    expect(departuresLayout("landscape")).toBe("side-by-side");
    expect(departureRowsPerPage("landscape")).toBe(5);

    const html = renderToStaticMarkup(
      <DisplayPlayer slug="front-window" orientation="landscape" initial={departures} loadedBuildId="dev" preview />,
    );
    expect(html).toContain("data-display-orientation=\"landscape\"");
    expect(html).toContain("data-display-safe-inset=\"0\"");
    expect(html).not.toContain("data-display-deadzone");
    expect(html).toContain("data-display-chrome=\"tmf\"");
    expect(html).toContain("bg-[#FFF6D3]");
    expect(html).toContain("border-[#DDB1B1]");
    expect(html).toContain("font-jetbrains");
    expect(html).toContain("src=\"/logo.png\"");
    expect(html).toContain("data-departures-layout=\"side-by-side\"");
    expect(html).toContain("data-board-column=\"departures\"");
    expect(html).toContain("data-board-column=\"arrivals\"");
    expect(html).toContain("vh");
    expect(names(html)).toBe(5);
    expect(html).not.toContain("GUEST F.");
  });

  it("lays film stats, idle, and the menu across the landscape frame", () => {
    const stats = renderToStaticMarkup(
      <DisplayPlayer
        slug="front-window"
        orientation="landscape"
        initial={payload("film_stats", {
          rollsProcessing: 12,
          receivedToday: 3,
          receivedThisWeek: 9,
          scansSentToday: 2,
          scansSentThisWeek: 8,
          averageColorTurnaroundDays: 4.2,
          averageBwTurnaroundDays: 6,
          nextLabRun: "Tuesday",
        })}
        loadedBuildId="dev"
        preview
      />,
    );
    expect(stats).toContain("data-stats-layout=\"landscape\"");
    expect(stats).toContain("data-stat=\"rolls-processing\"");
    expect(stats).toContain("data-stat=\"turnaround\"");
    expect(stats).toContain("grid-cols-5");
    expect(stats).toContain("data-display-safe-inset=\"0\"");

    const idle = renderToStaticMarkup(
      <DisplayPlayer slug="front-window" orientation="landscape" initial={payload("idle")} loadedBuildId="dev" preview />,
    );
    expect(idle).toContain("data-idle-layout=\"landscape\"");
    expect(idle).toContain("Welcome");
    expect(idle).toContain("src=\"/logo.png\"");

    const menu = renderToStaticMarkup(
      <DisplayPlayer
        slug="front-window"
        orientation="landscape"
        initial={payload("film_menu", {
          menu: {
            title: "Your's film menu",
            subtitle: "Durham",
            banner: [],
            sections: [
              { title: "35mm", items: [{ name: "Gold 200", price: "$12" }] },
              { title: "120", items: [{ name: "Portra 400", price: "$16" }] },
            ],
            notes: [],
          },
        })}
        loadedBuildId="dev"
        preview
      />,
    );
    expect(menu).toContain("data-menu-layout=\"landscape\"");
    expect(menu).toContain("grid-cols-2");
    expect(menu).toContain("Gold 200");
  });

  it("shows a first name and last initial on the window, and leaves the studio name as-is", () => {
    const data = {
      firstName: "Avery Sample",
      sessionType: "1 Hour Session",
      start: "2:00 PM",
      end: "3:00 PM",
    };
    const landscape = renderToStaticMarkup(
      <DisplayPlayer
        slug="front-window"
        orientation="landscape"
        initial={payload("studio_welcome", data)}
        loadedBuildId="dev"
        preview
      />,
    );
    expect(landscape).toContain("AVERY S.");
    expect(landscape).not.toContain("SAMPLE");
    expect(landscape).toContain("data-studio-layout=\"landscape\"");

    const portrait = renderToStaticMarkup(
      <YoursCleanScreen payload={payload("studio_welcome", { ...data, firstName: "Avery" })} />,
    );
    expect(portrait).toContain(">Avery<");
    expect(portrait).not.toContain("AVERY S.");
    expect(portrait).not.toContain("data-display-chrome=\"tmf\"");
  });
});
