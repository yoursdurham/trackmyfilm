"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isMarketingPreview } from "@/lib/marketing/access";
import { scheduleExplanation } from "@/lib/marketing/delivery";
import { DEFAULT_TIMEZONE } from "@/lib/marketing/types";
import EditorScreen from "@/components/marketing/EditorScreen";
import { EmptyNote, Panel } from "@/components/marketing/MarketingShell";

export default function CampaignList() {
  const params = useSearchParams();
  const preview = isMarketingPreview("/marketing/campaigns", params.get("preview"));
  return (
    <Panel title="Campaigns" action={<Link href={`/marketing/campaigns/new${preview ? "?preview=1&step=review" : ""}`} className="text-sm text-amber-700 underline">New campaign</Link>}>
      {preview ? <EmptyNote>No campaigns are loaded in this preview. Statuses you can use later: draft, scheduled, sending, sent, paused, failed.</EmptyNote> : <LiveList />}
    </Panel>
  );
}

function LiveList() {
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; status: string }[] | null>(null);
  const [error, setError] = useState("");
  if (!campaigns && !error) {
    void fetch("/api/marketing/campaigns").then(async (response) => {
      const body = await response.json();
      if (!response.ok) setError(body.error ?? "Could not load campaigns.");
      else setCampaigns(body.campaigns ?? []);
    });
  }
  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!campaigns) return <p className="text-sm text-slate-500">Loading campaigns.</p>;
  if (!campaigns.length) return <EmptyNote>No campaigns yet.</EmptyNote>;
  return (
    <ul className="space-y-2 text-sm">
      {campaigns.map((campaign) => (
        <li key={campaign.id}><Link className="underline" href={`/marketing/campaigns/${campaign.id}`}>{campaign.name}</Link> · {campaign.status}</li>
      ))}
    </ul>
  );
}

export function CampaignEditor({ campaignId }: { campaignId: string }) {
  const params = useSearchParams();
  const preview = isMarketingPreview("/marketing/campaigns", params.get("preview"));
  const step = params.get("step") === "review" || preview ? "review" : "edit";
  const [confirmed, setConfirmed] = useState(false);
  const [date, setDate] = useState("2026-11-22");
  const [time, setTime] = useState("10:00");
  const [testTo, setTestTo] = useState("");
  const [note, setNote] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [countLabel, setCountLabel] = useState(preview ? "Sign in to count people with consent. This preview is not a live count." : "Count the audience before scheduling.");
  const [draft, setDraft] = useState<{ subject: string; previewText: string; blocks: { id: string; type: "heading" | "text" | "button"; text?: string; label?: string; href?: string }[]; plainText: string }>({
    subject: "A note from Yours,",
    previewText: "A note from the shop.",
    blocks: [
      { id: "heading", type: "heading", text: "A note from Yours," },
      { id: "body", type: "text", text: "Hi {{first_name}},\n\nWrite what you want to say. This stays a draft until you confirm a campaign." },
      { id: "button", type: "button", label: "Open your account", href: "https://trackmyfilm.com/account" },
    ],
    plainText: "",
  });

  return (
    <div className="space-y-4">
      {step === "edit" && !preview ? <EditorScreen initialSubject={draft.subject} initialPreview={draft.previewText} onChange={setDraft} /> : null}
      <Panel title="Review before anything is scheduled">
        <p className="text-sm text-slate-600">{scheduleExplanation()}</p>
        <dl className="mt-4 space-y-2 text-sm text-slate-700">
          <div className="flex justify-between gap-3"><dt>From</dt><dd>Yours, using the verified RESEND_FROM_EMAIL address</dd></div>
          <div className="flex justify-between gap-3"><dt>Timezone</dt><dd>{DEFAULT_TIMEZONE}</dd></div>
          <div className="flex justify-between gap-3"><dt>Recipients</dt><dd>{countLabel}</dd></div>
        </dl>
        {preview ? null : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Input value={segmentId} onChange={(event) => setSegmentId(event.target.value)} placeholder="Saved segment id, or blank for subscribers only" />
            <Button type="button" variant="outline" onClick={() => countAudience(segmentId, setFingerprint, setCountLabel)}>Count</Button>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">A blank segment means people who asked for marketing email. It does not include every customer. Exclusions are listed by the count.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-auto" />
          <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="w-auto" />
        </div>
        <p className="mt-2 text-xs text-slate-500">The date and time are America/New_York. The daily check is 10:00 AM or 11:00 AM Eastern, depending on daylight saving time.</p>
        <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          I have reviewed the email, the sender, the time, and the count. Schedule only the people with marketing consent.
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={!confirmed || preview || !fingerprint} onClick={() => schedule(campaignId, date, time, fingerprint, segmentId, draft, setNote)}>Schedule</Button>
        </div>
        {note ? <p className="mt-2 text-sm text-slate-700">{note}</p> : null}
      </Panel>
      <Panel title="Test send">
        <Input value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="Type one address" />
        <Button className="mt-3" variant="outline" disabled={preview || campaignId === "new"} onClick={() => sendTest(campaignId, testTo, setNote)}>Send test to this address</Button>
      </Panel>
      {preview ? null : <CampaignReport id={campaignId} />}
    </div>
  );
}

async function countAudience(segmentId: string, setFingerprint: (value: string) => void, setCountLabel: (value: string) => void) {
  const list = await fetch("/api/marketing/segments").then((response) => response.json());
  const segment = (list.segments ?? []).find((item: { id: string; filter: unknown }) => item.id === segmentId);
  const filter = segment?.filter ?? { op: "and", children: [] };
  const response = await fetch("/api/marketing/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filter }),
  });
  const body = await response.json();
  if (!response.ok || body.unavailable) {
    setFingerprint("");
    setCountLabel(body.unavailable || body.error || "Could not count.");
    return;
  }
  setFingerprint(body.fingerprint ?? "");
  setCountLabel(`${body.recipientCount} with consent. ${body.excludedCount} excluded.`);
}

async function schedule(
  id: string,
  date: string,
  time: string,
  fingerprint: string,
  segmentId: string,
  draft: { subject: string; previewText: string; blocks: unknown; plainText: string },
  setNote: (value: string) => void,
) {
  const save = await fetch(id === "new" ? "/api/marketing/campaigns" : `/api/marketing/campaigns/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: id === "new" ? undefined : "save",
      name: draft.subject || "Marketing email",
      segmentId: segmentId || null,
      adHocFilter: segmentId ? null : { op: "and", children: [] },
      subject: draft.subject,
      previewText: draft.previewText,
      blocks: draft.blocks,
      plainText: draft.plainText,
    }),
  });
  const saved = await save.json();
  if (!save.ok) {
    setNote(saved.error ?? "Could not save the draft.");
    return;
  }
  const campaignId = saved.id ?? id;
  const response = await fetch(`/api/marketing/campaigns/${campaignId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "confirm", confirmed: true, date, time, fingerprint }),
  });
  const body = await response.json();
  setNote(body.error ?? `Scheduled for ${body.recipients ?? 0} people. The daily check, or Process due sends, delivers the next batch of 20.`);
}

async function sendTest(id: string, to: string, setNote: (value: string) => void) {
  const response = await fetch(`/api/marketing/campaigns/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "test", to }),
  });
  const body = await response.json();
  setNote(body.error ?? "Test sent to the address you typed.");
}

function CampaignReport({ id }: { id: string }) {
  const [report, setReport] = useState<{ counts?: Record<string, number>; failures?: { email: string; error: string | null }[]; engagement?: Record<string, { state: string; value?: number; reason?: string; note?: string }>; conversions?: { state: string; value?: number; reason?: string; note?: string } } | null>(null);
  if (id === "new") return null;
  if (!report) {
    void fetch(`/api/marketing/campaigns/${id}`).then(async (response) => {
      if (response.ok) setReport(await response.json());
    });
    return null;
  }
  return (
    <Panel title="Results">
      <p className="text-sm text-slate-600">Sent {report.counts?.sent ?? 0}. Failed {report.counts?.failed ?? 0}. Pending {report.counts?.pending ?? 0}. Opens are approximate when they are available.</p>
      {report.failures?.length ? (
        <ul className="mt-2 text-sm">{report.failures.map((failure) => <li key={failure.email}>{failure.email}: {failure.error}</li>)}</ul>
      ) : null}
      {report.conversions?.state === "unavailable" ? <p className="mt-2 text-sm text-slate-600">{report.conversions.reason}</p> : report.conversions?.state === "value" ? <p className="mt-2 text-sm">{report.conversions.value} drop-offs. {report.conversions.note}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button variant="outline" onClick={() => fetch(`/api/marketing/campaigns/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pause" }) })}>Pause</Button>
        <Button variant="outline" onClick={() => fetch(`/api/marketing/campaigns/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel_remaining" }) })}>Cancel remaining</Button>
        <Button variant="outline" onClick={() => fetch(`/api/marketing/campaigns/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry_failed" }) })}>Retry failed only</Button>
      </div>
    </Panel>
  );
}
