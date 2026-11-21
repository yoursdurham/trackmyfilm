"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isMarketingPreview } from "@/lib/marketing/access";
import { DEFAULT_PHYSICAL_ADDRESS, SHOP_NAME } from "@/lib/marketing/types";
import { EmptyNote, Panel } from "@/components/marketing/MarketingShell";

export default function SettingsScreen() {
  const params = useSearchParams();
  const preview = isMarketingPreview("/marketing/settings", params.get("preview"));
  const [address, setAddress] = useState(DEFAULT_PHYSICAL_ADDRESS);
  const [replyTo, setReplyTo] = useState("");
  const [capCount, setCapCount] = useState(4);
  const [capDays, setCapDays] = useState(30);
  const [windowDays, setWindowDays] = useState(14);
  const [note, setNote] = useState("");

  async function save() {
    const response = await fetch("/api/marketing/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ physicalAddress: address, replyTo, frequencyCapCount: capCount, frequencyCapDays: capDays, attributionWindowDays: windowDays }),
    });
    const body = await response.json();
    setNote(body.error ?? "Saved.");
  }

  return (
    <div className="space-y-4">
      <Panel title="Sender">
        <p className="text-sm text-slate-600">The shop name in marketing email is {SHOP_NAME}. The from address stays on the verified RESEND_FROM_EMAIL domain. This screen does not create a Resend audience, contact, or domain.</p>
        <label className="mt-3 block text-sm">Shop address
          <Input className="mt-1" value={address} onChange={(event) => setAddress(event.target.value)} />
        </label>
        <label className="mt-3 block text-sm">Reply-to, optional
          <Input className="mt-1" value={replyTo} onChange={(event) => setReplyTo(event.target.value)} placeholder="hello@yoursdurham.com" />
        </label>
      </Panel>
      <Panel title="Frequency cap">
        <p className="mb-3 text-sm text-slate-600">Marketing email only. Drop-off, lab, and scans messages are not counted here.</p>
        <div className="flex gap-2">
          <Input type="number" value={capCount} onChange={(event) => setCapCount(Number(event.target.value))} />
          <Input type="number" value={capDays} onChange={(event) => setCapDays(Number(event.target.value))} />
        </div>
        <p className="mt-2 text-xs text-slate-500">Count per window, in days. Zero holds every marketing send.</p>
      </Panel>
      <Panel title="Attribution">
        <p className="text-sm text-slate-600">A conversion is a film order created within this many days after a click. Without webhook clicks, the report says unavailable instead of zero.</p>
        <Input className="mt-3" type="number" value={windowDays} onChange={(event) => setWindowDays(Number(event.target.value))} />
      </Panel>
      {preview ? <EmptyNote>Sign in to save these. The address shown is the shop default, not a live setting read from the database.</EmptyNote> : <Button onClick={save}>Save settings</Button>}
      {note ? <p className="text-sm">{note}</p> : null}
    </div>
  );
}
