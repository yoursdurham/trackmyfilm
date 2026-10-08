"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Monitor } from "lucide-react";
import { toast } from "sonner";
import InternalHeader from "@/components/InternalHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import FilmMenuEditor from "@/components/displays/FilmMenuEditor";
import { SELECTABLE_DEFAULT_MODES } from "@/lib/display";
import type { AdminDisplay } from "@/lib/display-admin";

const CANVAS = { width: 1080, height: 3840 };
const PREVIEW_HEIGHT = 640;

function modeLabel(mode: string) {
  if (mode === "idle") return "Branded idle";
  if (mode === "custom_message") return "Custom message";
  if (mode === "studio_active") return "Studio session";
  if (mode === "studio_welcome") return "Studio welcome";
  if (mode === "studio_upcoming") return "Up next";
  if (mode === "studio_ending_soon") return "Session ending";
  if (mode === "film_stats") return "Film stats";
  if (mode === "film_menu") return "Film menu";
  return mode;
}

function seenLabel(lastSeen: string | null) {
  if (!lastSeen) return "Never checked in";
  const date = new Date(lastSeen);
  if (Number.isNaN(date.getTime())) return "Never checked in";
  return `Last seen ${formatDistanceToNow(date, { addSuffix: true })}`;
}

export default function DisplaysPage() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);

  const { data: displays = [], isLoading, isError } = useQuery<AdminDisplay[]>({
    queryKey: ["displays"],
    queryFn: async () => {
      const response = await fetch("/api/displays");
      if (!response.ok) throw new Error("Failed to load displays");
      return response.json();
    },
    refetchInterval: 30_000,
  });

  const save = useMutation({
    mutationFn: async ({ slug, body }: { slug: string; body: Record<string, unknown> }) => {
      const response = await fetch(`/api/displays/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Could not update the screen");
      }
      return payload as AdminDisplay;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<AdminDisplay[]>(["displays"], (current = []) =>
        current.map((row) => row.slug === updated.slug ? updated : row));
      toast.success("Screen updated");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const scale = PREVIEW_HEIGHT / CANVAS.height;

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-orange-50/30 to-amber-50/20">
      <InternalHeader title="Displays" subtitle="Studio screens" />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-6 max-w-2xl text-sm text-slate-500">
          Each screen opens one address and shows whatever you set here. A screen is online if it checked in during the last minute and a half.
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-stone-200 bg-white px-6 py-16 text-center shadow-sm">
            <p className="text-slate-700">Displays could not be loaded.</p>
            <p className="mt-2 text-sm text-slate-500">
              Run <span className="font-mono">supabase/migrations/017_displays.sql</span> in the Supabase SQL editor, then refresh.
            </p>
          </div>
        ) : displays.length === 0 ? (
          <div className="rounded-xl border border-stone-200 bg-white px-6 py-16 text-center shadow-sm">
            <Monitor className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <p className="text-slate-700">No screens yet.</p>
            <p className="mt-2 text-sm text-slate-500">
              Run <span className="font-mono">supabase/migrations/017_displays.sql</span> in the Supabase SQL editor. It adds the studio screen.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {displays.map((display) => {
              const message = drafts[display.slug] ?? display.overrideMessage ?? "";
              const previewOpen = previewSlug === display.slug;
              const modeChoices = SELECTABLE_DEFAULT_MODES.some((option) => option.value === display.defaultMode)
                ? SELECTABLE_DEFAULT_MODES
                : [...SELECTABLE_DEFAULT_MODES, { value: display.defaultMode, label: display.defaultMode }];
              return (
                <section key={display.slug} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-slate-800">{display.name}</h2>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                          display.online ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${display.online ? "bg-emerald-500" : "bg-stone-400"}`} />
                          {display.online ? "Online" : "Offline"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {display.slug} · {display.orientation} · {display.resolution || "resolution not set"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Showing <span className="font-medium text-slate-800">{modeLabel(display.resolvedMode)}</span>
                        {" · "}
                        {seenLabel(display.lastSeen)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-slate-200"
                      onClick={() => setPreviewSlug(previewOpen ? null : display.slug)}
                    >
                      {previewOpen ? "Hide preview" : "Open preview"}
                    </Button>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-[16rem_1fr]">
                    <label className="block text-sm text-slate-600">
                      Default mode
                      <select
                        aria-label={`Default mode for ${display.name}`}
                        value={display.defaultMode}
                        onChange={(event) => {
                          save.mutate({ slug: display.slug, body: { mode: event.target.value } });
                        }}
                        className="mt-1 h-9 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/20"
                      >
                        {modeChoices.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <span className="mt-1 block text-xs text-slate-400">
                        Used when the custom message is cleared.
                      </span>
                    </label>

                    <div>
                      <label htmlFor={`message-${display.slug}`} className="text-sm text-slate-600">
                        Custom message
                      </label>
                      <Textarea
                        id={`message-${display.slug}`}
                        value={message}
                        maxLength={280}
                        onChange={(event) => setDrafts((current) => ({ ...current, [display.slug]: event.target.value }))}
                        placeholder="Shown on the screen until you clear it"
                        className="mt-1 min-h-24 border-stone-200 bg-white text-base"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          className="bg-amber-600 text-white hover:bg-amber-700"
                          disabled={save.isPending || !message.trim()}
                          onClick={() => save.mutate({ slug: display.slug, body: { overrideMessage: message } })}
                        >
                          Show this message
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-slate-200"
                          disabled={save.isPending || !display.overrideMessage}
                          onClick={() => {
                            setDrafts((current) => ({ ...current, [display.slug]: "" }));
                            save.mutate({ slug: display.slug, body: { clearOverride: true } });
                          }}
                        >
                          Clear message
                        </Button>
                      </div>
                    </div>
                  </div>

                  {display.slug === displays[0]?.slug ? <FilmMenuEditor /> : null}

                  {previewOpen && (
                    <div className="mt-6 flex flex-col items-center border-t border-stone-100 pt-5">
                      <p className="mb-3 text-xs tracking-wide text-slate-400 uppercase">
                        1080 × 3840 preview
                      </p>
                      <div
                        className="overflow-hidden rounded-lg bg-stone-200 shadow-inner ring-1 ring-stone-300"
                        style={{ width: CANVAS.width * scale, height: PREVIEW_HEIGHT }}
                      >
                        <iframe
                          title={`Preview of ${display.name}`}
                          src={`/display/${display.slug}?preview=1`}
                          className="origin-top-left border-0"
                          style={{
                            width: CANVAS.width,
                            height: CANVAS.height,
                            transform: `scale(${scale})`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
