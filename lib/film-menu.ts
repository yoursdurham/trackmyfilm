import seed from "@/lib/film-menu-seed.json";

export interface FilmMenuItem {
  name: string;
  price: string;
}

export interface FilmMenuSection {
  title: string;
  items: FilmMenuItem[];
}

export interface FilmMenuNote {
  text: string;
  heading?: boolean;
}

export interface FilmMenu {
  title: string;
  subtitle: string;
  banner: string[];
  sections: FilmMenuSection[];
  notes: FilmMenuNote[];
}

/** The menu the Pi used to show, including both "Expired 35mm/120 Roll" lines. */
export const FILM_MENU_SEED = seed as FilmMenu;

export const FILM_MENU_SLUG = "studio";

const LIMITS = {
  title: 80,
  subtitle: 80,
  bannerLine: 80,
  banner: 6,
  sections: 8,
  sectionTitle: 60,
  items: 80,
  name: 80,
  price: 16,
  notes: 16,
  note: 180,
} as const;

function plain(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function asItem(value: unknown): FilmMenuItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const name = plain(row.name, LIMITS.name);
  const price = plain(row.price, LIMITS.price);
  if (!name) return null;
  return { name, price };
}

function asSection(value: unknown): FilmMenuSection | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const title = plain(row.title, LIMITS.sectionTitle);
  const items = Array.isArray(row.items)
    ? row.items.slice(0, LIMITS.items).map(asItem).filter((item): item is FilmMenuItem => item !== null)
    : [];
  if (!title || items.length === 0) return null;
  return { title, items };
}

function asNote(value: unknown): FilmMenuNote | null {
  if (typeof value === "string") {
    const text = plain(value, LIMITS.note);
    return text ? { text } : null;
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const text = plain(row.text, LIMITS.note);
  if (!text) return null;
  return row.heading === true ? { text, heading: true } : { text };
}

/** Rebuilds a menu from untrusted JSON. Unknown keys, including customer fields, are dropped. */
export function sanitizeFilmMenu(input: unknown): FilmMenu | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const title = plain(row.title, LIMITS.title);
  const subtitle = plain(row.subtitle, LIMITS.subtitle);
  const banner = Array.isArray(row.banner)
    ? row.banner.map((line) => plain(line, LIMITS.bannerLine)).filter(Boolean).slice(0, LIMITS.banner)
    : [];
  const sections = Array.isArray(row.sections)
    ? row.sections.slice(0, LIMITS.sections).map(asSection).filter((section): section is FilmMenuSection => section !== null)
    : [];
  const notes = Array.isArray(row.notes)
    ? row.notes.slice(0, LIMITS.notes).map(asNote).filter((note): note is FilmMenuNote => note !== null)
    : [];
  if (!title && sections.length === 0 && notes.length === 0) return null;
  return { title, subtitle, banner, sections, notes };
}

export function filmMenuHasContent(menu: FilmMenu | null | undefined): menu is FilmMenu {
  return Boolean(menu && (menu.sections.length > 0 || menu.notes.length > 0 || menu.title));
}
