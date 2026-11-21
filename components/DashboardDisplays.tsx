"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SELECTABLE_DEFAULT_MODES } from "@/lib/display";
import { OPEN_SIGN_MODES, type OpenSignMode } from "@/lib/shop-hours";

interface DashboardDisplay {
  slug: string;
  name: string;
  mode: string;
  openSignMode: OpenSignMode;
  showOpenSign: boolean;
}

const OPEN_SIGN_LABELS: Record<OpenSignMode, string> = {
  auto: "Auto",
  on: "On",
  off: "Off",
};

export default function DashboardDisplays() {
  const queryClient = useQueryClient();
  const { data } = useQuery<{ displays: DashboardDisplay[] } | null>({
    queryKey: ["dashboard-displays"],
    retry: false,
    queryFn: async () => {
      const response = await fetch("/api/dashboard/displays");
      if (response.status === 401 || response.status === 403) return null;
      if (!response.ok) throw new Error("Failed to load screens");
      return response.json();
    },
  });

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const response = await fetch("/api/dashboard/displays", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Could not update the screen");
      }
      return payload as DashboardDisplay;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard-displays"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!data?.displays?.length) return null;

  return (
    <section className="mb-6 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">Screens</h2>
      <p className="mt-1 text-xs text-slate-500">
        Screens re-read this on their own schedule. Reload the TV, or open it with ?refresh=1, to apply a change now.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {data.displays.map((display) => {
          const modes = SELECTABLE_DEFAULT_MODES.some((option) => option.value === display.mode)
            ? SELECTABLE_DEFAULT_MODES
            : [...SELECTABLE_DEFAULT_MODES, { value: display.mode, label: display.mode }];
          return (
          <div key={display.slug} className="rounded-lg border border-stone-100 p-3">
            <p className="text-sm font-medium text-slate-800">{display.name}</p>
            <label className="mt-2 block text-xs text-slate-600">
              Mode
              <select
                aria-label={`Mode for ${display.name}`}
                value={display.mode}
                onChange={(event) => save.mutate({ slug: display.slug, mode: event.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm text-slate-800"
              >
                {modes.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="mt-2 block text-xs text-slate-600">
              Open sign
              <select
                aria-label={`Open sign for ${display.name}`}
                value={display.openSignMode}
                onChange={(event) => save.mutate({ slug: display.slug, openSignMode: event.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm text-slate-800"
              >
                {OPEN_SIGN_MODES.map((mode) => (
                  <option key={mode} value={mode}>{OPEN_SIGN_LABELS[mode]}</option>
                ))}
              </select>
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                aria-label={`Show open sign for ${display.name}`}
                className="h-4 w-4 accent-amber-600"
                checked={display.showOpenSign}
                onChange={(event) => save.mutate({ slug: display.slug, showOpenSign: event.target.checked })}
              />
              Show open sign
            </label>
          </div>
          );
        })}
      </div>
    </section>
  );
}
