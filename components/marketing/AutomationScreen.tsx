"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { isMarketingPreview } from "@/lib/marketing/access";
import { scheduleExplanation } from "@/lib/marketing/delivery";
import { starterAutomations } from "@/lib/marketing/starters";
import { EmptyNote, Panel } from "@/components/marketing/MarketingShell";

export default function AutomationList() {
  const params = useSearchParams();
  const preview = isMarketingPreview("/marketing/automations", params.get("preview"));
  const starters = starterAutomations();
  return (
    <div className="space-y-4">
      <Panel title="Automations">
        <p className="mb-3 text-sm text-slate-600">{scheduleExplanation()} Every starter is created off. Turning one on only considers events that happen after that moment, and consent is checked again before each send.</p>
        <ul className="space-y-3">
          {starters.map((automation) => (
            <li key={automation.id} className="rounded-xl bg-stone-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <Link href={`/marketing/automations/${automation.id}${preview ? "?preview=1" : ""}`} className="font-medium text-slate-800 underline">{automation.name}</Link>
                <span className="text-sm text-slate-500">Draft, off</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{automation.description}</p>
            </li>
          ))}
        </ul>
      </Panel>
      {preview ? null : <LiveAutomations />}
    </div>
  );
}

function LiveAutomations() {
  const [rows, setRows] = useState<{ id: string; name: string; status: string }[] | null>(null);
  const [error, setError] = useState("");
  if (!rows && !error) {
    void fetch("/api/marketing/automations").then(async (response) => {
      const body = await response.json();
      if (!response.ok) setError(body.error ?? "Could not load automations.");
      else setRows(body.automations ?? []);
    });
  }
  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!rows) return null;
  return (
    <Panel title="Saved state">
      {rows.length === 0 ? <EmptyNote>Nothing is saved yet. Open this page while signed in to store the drafts.</EmptyNote> : (
        <ul className="space-y-2 text-sm">
          {rows.map((row) => <li key={row.id}>{row.name} · {row.status}</li>)}
        </ul>
      )}
    </Panel>
  );
}

export function AutomationEditor({ automationId }: { automationId: string }) {
  const params = useSearchParams();
  const preview = isMarketingPreview("/marketing/automations", params.get("preview"));
  const starter = starterAutomations().find((item) => item.id === automationId) ?? starterAutomations()[0]!;
  const [status, setStatus] = useState(starter.status);
  const [note, setNote] = useState("");

  async function change(next: "draft" | "active" | "paused") {
    const response = await fetch(`/api/marketing/automations/${automationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", status: next }),
    });
    const body = await response.json();
    if (!response.ok) setNote(body.error ?? "Could not update it.");
    else {
      setStatus(next);
      setNote(next === "active" ? "On. Only new matching events are added, and each send checks consent again." : "Off.");
    }
  }

  return (
    <div className="space-y-4">
      <Panel title={starter.name}>
        <p className="text-sm text-slate-600">{starter.description}</p>
        <dl className="mt-4 space-y-2 text-sm text-slate-700">
          <div>Trigger: {starter.trigger.type}</div>
          <div>Wait: {starter.delayHours} hours, then the next daily check or Process due sends</div>
          <div>Re-entry: {starter.reentry === "never" ? "Once" : "After the cooldown"}</div>
          <div>Cooldown: {starter.cooldownDays} days</div>
          <div>Exits: {starter.exits.length ? starter.exits.join(", ") : "Consent is still required"}</div>
          <div>Status: {status}</div>
        </dl>
        <p className="mt-3 text-sm text-slate-600">Subject: {starter.subject}</p>
        {preview ? <EmptyNote>Eligible people are counted after you sign in. This preview does not show a stand-in number.</EmptyNote> : null}
        {preview ? null : (
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => change("paused")}>Pause</Button>
            <Button onClick={() => change("active")}>Turn on</Button>
            <Button variant="outline" onClick={() => change("draft")}>Back to draft</Button>
          </div>
        )}
        {note ? <p className="mt-2 text-sm">{note}</p> : null}
      </Panel>
    </div>
  );
}
