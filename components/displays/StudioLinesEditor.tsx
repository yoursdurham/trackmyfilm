"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { STUDIO_LINE_LIMIT, STUDIO_LINE_MAX } from "@/lib/studio-info";

function moveItem(list: string[], index: number, delta: number): string[] {
  const next = index + delta;
  if (next < 0 || next >= list.length) return list;
  const copy = list.slice();
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item ?? "");
  return copy;
}

function EditorForm({
  title,
  hint,
  lines,
  onSave,
  saving,
}: {
  title: string;
  hint: string;
  lines: string[];
  onSave: (lines: string[]) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(lines);

  function update(index: number, value: string) {
    setDraft((current) => current.map((line, lineIndex) => lineIndex === index ? value : line));
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-3">
      <h3 className="text-sm font-medium text-slate-800">{title}</h3>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
      <div className="mt-3 space-y-2">
        {draft.map((line, index) => (
          <div key={index} className="flex items-start gap-2">
            <input
              aria-label={`${title} line ${index + 1}`}
              value={line}
              maxLength={STUDIO_LINE_MAX}
              onChange={(event) => update(index, event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/20"
            />
            <Button
              type="button"
              variant="outline"
              className="border-slate-200 px-2"
              disabled={index === 0}
              onClick={() => setDraft((current) => moveItem(current, index, -1))}
            >
              Up
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-slate-200 px-2"
              disabled={index === draft.length - 1}
              onClick={() => setDraft((current) => moveItem(current, index, 1))}
            >
              Down
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-slate-200 px-2"
              onClick={() => setDraft((current) => current.filter((_, lineIndex) => lineIndex !== index))}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="border-slate-200"
          disabled={draft.length >= STUDIO_LINE_LIMIT}
          onClick={() => setDraft((current) => [...current, ""])}
        >
          Add line
        </Button>
        <Button
          type="button"
          className="bg-amber-600 text-white hover:bg-amber-700"
          disabled={saving}
          onClick={() => onSave(draft)}
        >
          Save {title.toLowerCase()}
        </Button>
      </div>
    </div>
  );
}

export default function StudioLinesEditor({
  title,
  hint,
  lines,
  onSave,
  saving,
}: {
  title: string;
  hint: string;
  lines: string[];
  onSave: (lines: string[]) => void;
  saving: boolean;
}) {
  return (
    <EditorForm
      key={lines.join("\u0000")}
      title={title}
      hint={hint}
      lines={lines}
      onSave={onSave}
      saving={saving}
    />
  );
}
