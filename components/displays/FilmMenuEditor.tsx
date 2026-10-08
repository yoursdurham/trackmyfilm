"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { FilmMenu, FilmMenuItem, FilmMenuNote, FilmMenuSection } from "@/lib/film-menu";

const fieldClass = "h-9 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/20";

function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const next = index + delta;
  if (next < 0 || next >= list.length) return list;
  const copy = list.slice();
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}

export default function FilmMenuEditor() {
  const [menu, setMenu] = useState<FilmMenu | null>(null);
  const [openSection, setOpenSection] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/film-menu");
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(response.status === 404 ? "missing" : "failed");
        }
        if (!cancelled) {
          setMenu(body.menu as FilmMenu);
          setLoadError(null);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setLoadError(err instanceof Error && err.message === "missing" ? "missing" : "failed");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateSection(index: number, section: FilmMenuSection) {
    setMenu((current) => current && ({
      ...current,
      sections: current.sections.map((row, rowIndex) => rowIndex === index ? section : row),
    }));
  }

  function updateItem(sectionIndex: number, itemIndex: number, patch: Partial<FilmMenuItem>) {
    const section = menu?.sections[sectionIndex];
    if (!section) return;
    updateSection(sectionIndex, {
      ...section,
      items: section.items.map((item, index) => index === itemIndex ? { ...item, ...patch } : item),
    });
  }

  async function save() {
    if (!menu) return;
    setSaving(true);
    try {
      const response = await fetch("/api/film-menu", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ menu }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Could not save the menu");
      }
      setMenu(body.menu as FilmMenu);
      toast.success("Film menu saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not save the menu");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="mt-5 rounded-lg border border-stone-200 bg-stone-50 px-4 py-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Film menu</p>
        <p className="mt-1">
          {loadError === "missing"
            ? "The menu is not in the database yet."
            : "The film menu could not be loaded."}
          {" "}
          Run <span className="font-mono">supabase/migrations/018_film_menu.sql</span> in the Supabase SQL editor, then refresh.
        </p>
      </div>
    );
  }

  if (!menu) {
    return <p className="mt-5 text-sm text-slate-400">Loading film menu…</p>;
  }

  return (
    <div className="mt-5 border-t border-stone-100 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-slate-800">Film menu</h3>
          <p className="mt-1 text-xs text-slate-400">
            Sections, prices, and the notes at the bottom of the screen.
          </p>
        </div>
        <Button
          type="button"
          className="bg-amber-600 text-white hover:bg-amber-700"
          disabled={saving}
          onClick={() => { void save(); }}
        >
          {saving ? "Saving…" : "Save menu"}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-slate-600">
          Title
          <input
            aria-label="Menu title"
            value={menu.title}
            maxLength={80}
            onChange={(event) => setMenu({ ...menu, title: event.target.value })}
            className={`${fieldClass} mt-1`}
          />
        </label>
        <label className="block text-sm text-slate-600">
          Subtitle
          <input
            aria-label="Menu subtitle"
            value={menu.subtitle}
            maxLength={80}
            onChange={(event) => setMenu({ ...menu, subtitle: event.target.value })}
            className={`${fieldClass} mt-1`}
          />
        </label>
      </div>

      <div className="mt-4 space-y-3">
        {menu.sections.map((section, sectionIndex) => {
          const open = openSection === sectionIndex;
          return (
            <section key={`${section.title}-${sectionIndex}`} className="rounded-lg border border-stone-200">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-slate-800"
                aria-expanded={open}
                onClick={() => setOpenSection(open ? -1 : sectionIndex)}
              >
                <span>{section.title || "Untitled section"}</span>
                <span className="text-xs font-normal text-slate-400">{section.items.length} items</span>
              </button>
              {open ? (
                <div className="border-t border-stone-100 px-3 py-3">
                  <label className="block text-sm text-slate-600">
                    Section name
                    <input
                      aria-label={`Section ${sectionIndex + 1} name`}
                      value={section.title}
                      maxLength={60}
                      onChange={(event) => updateSection(sectionIndex, { ...section, title: event.target.value })}
                      className={`${fieldClass} mt-1`}
                    />
                  </label>
                  <div className="mt-3 space-y-2">
                    {section.items.map((item, itemIndex) => (
                      <div key={`${sectionIndex}-${itemIndex}`} className="grid grid-cols-[1fr_7rem_auto] gap-2">
                        <input
                          aria-label={`${section.title} item ${itemIndex + 1} name`}
                          value={item.name}
                          maxLength={80}
                          onChange={(event) => updateItem(sectionIndex, itemIndex, { name: event.target.value })}
                          className={fieldClass}
                        />
                        <input
                          aria-label={`${section.title} item ${itemIndex + 1} price`}
                          value={item.price}
                          maxLength={16}
                          onChange={(event) => updateItem(sectionIndex, itemIndex, { price: event.target.value })}
                          className={`${fieldClass} text-right`}
                        />
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 border-slate-200 px-2"
                            aria-label={`Move ${item.name || "item"} up`}
                            onClick={() => updateSection(sectionIndex, {
                              ...section,
                              items: moveItem(section.items, itemIndex, -1),
                            })}
                          >
                            Up
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 border-slate-200 px-2"
                            aria-label={`Remove ${item.name || "item"}`}
                            onClick={() => updateSection(sectionIndex, {
                              ...section,
                              items: section.items.filter((_, index) => index !== itemIndex),
                            })}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 border-slate-200"
                    onClick={() => updateSection(sectionIndex, {
                      ...section,
                      items: [...section.items, { name: "", price: "" }],
                    })}
                  >
                    Add item
                  </Button>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-slate-800">Footer notes</h4>
          <Button
            type="button"
            variant="outline"
            className="border-slate-200"
            onClick={() => setMenu({
              ...menu,
              notes: [...menu.notes, { text: "" }],
            })}
          >
            Add note
          </Button>
        </div>
        <div className="mt-2 space-y-2">
          {menu.notes.map((note, index) => (
            <NoteRow
              key={`note-${index}`}
              note={note}
              onChange={(next) => setMenu({
                ...menu,
                notes: menu.notes.map((row, rowIndex) => rowIndex === index ? next : row),
              })}
              onRemove={() => setMenu({
                ...menu,
                notes: menu.notes.filter((_, rowIndex) => rowIndex !== index),
              })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function NoteRow({
  note,
  onChange,
  onRemove,
}: {
  note: FilmMenuNote;
  onChange: (note: FilmMenuNote) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-2">
      <input
        aria-label="Footer note"
        value={note.text}
        maxLength={180}
        onChange={(event) => onChange({ ...note, text: event.target.value })}
        className={fieldClass}
      />
      <label className="flex items-center gap-2 text-xs text-slate-500">
        <input
          type="checkbox"
          checked={note.heading === true}
          onChange={(event) => onChange(event.target.checked
            ? { text: note.text, heading: true }
            : { text: note.text })}
        />
        Heading
      </label>
      <Button type="button" variant="outline" className="h-9 border-slate-200" onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}
