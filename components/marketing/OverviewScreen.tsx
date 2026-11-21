"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { isMarketingPreview } from "@/lib/marketing/access";
import { scheduleExplanation } from "@/lib/marketing/delivery";
import type { MetricValue } from "@/lib/marketing/types";
import { EmptyNote, Panel } from "@/components/marketing/MarketingShell";

type Overview = {
  audienceSize: number;
  subscribers: number;
  campaigns: { id: string; name: string; status: string; scheduledAt: string | null }[];
  upcoming: { id: string; name: string; scheduledAt: string | null }[];
  automations: { id: string; name: string; status: string }[];
  activity: { id: string; action: string; actor: string | null; created_at: string }[];
  engagement: Record<string, MetricValue>;
  alerts: { text: string }[];
  scheduleExplanation: string;
  nextCheck: string;
  missingMigration?: boolean;
  error?: string;
};

const METRICS: { key: string; label: string }[] = [
  { key: "sent", label: "Sent" },
  { key: "delivered", label: "Delivered" },
  { key: "bounced", label: "Bounced" },
  { key: "complained", label: "Complained" },
  { key: "unsubscribed", label: "Unsubscribed" },
  { key: "opened", label: "Opened, approximate" },
  { key: "clicked", label: "Clicked" },
];

function Metric({ label, metric, preview }: { label: string; metric?: MetricValue; preview: boolean }) {
  if (preview || !metric) {
    return (
      <div className="rounded-xl bg-stone-50 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-2 text-sm text-slate-600">Sign in to load this.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-stone-50 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      {metric.state === "unavailable" ? (
        <p className="mt-2 text-sm text-slate-600">Unavailable. {metric.reason}</p>
      ) : (
        <>
          <p className="mt-2 text-2xl font-semibold text-slate-800">{metric.value}</p>
          {metric.note ? <p className="mt-1 text-xs text-slate-500">{metric.note}</p> : null}
        </>
      )}
    </div>
  );
}

export default function OverviewScreen() {
  const params = useSearchParams();
  const preview = isMarketingPreview("/marketing", params.get("preview"));
  const [processNote, setProcessNote] = useState("");
  const query = useQuery<Overview>({
    queryKey: ["marketing-overview"],
    enabled: !preview,
    queryFn: async () => {
      const response = await fetch("/api/marketing/overview");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load marketing.");
      return body;
    },
  });

  async function processNow() {
    setProcessNote("");
    const response = await fetch("/api/marketing/process", { method: "POST" });
    const body = await response.json();
    setProcessNote(body.held || body.error || `Sent ${body.sent ?? 0}. Skipped ${body.skipped ?? 0}. Failed ${body.failed ?? 0}.`);
  }

  const data = query.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Email</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{preview ? scheduleExplanation() : data?.scheduleExplanation}</p>
        </div>
        {preview ? null : (
          <Button onClick={processNow} className="bg-amber-500 text-white hover:bg-amber-600">Process due sends</Button>
        )}
      </div>
      {processNote ? <p className="text-sm text-slate-700">{processNote}</p> : null}
      {query.error ? <p className="text-sm text-red-700">{query.error.message}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Panel title="Audience">
          {preview ? <EmptyNote>Sign in to load how many customer emails the shop has. An account or an order is not marketing consent.</EmptyNote> : (
            <p className="text-3xl font-semibold text-slate-800">{data?.audienceSize ?? "—"} <span className="text-base font-normal text-slate-500">people with an email</span></p>
          )}
        </Panel>
        <Panel title="Marketing subscribers">
          {preview ? <EmptyNote>Sign in to load people who asked for marketing email. Zero would mean none have asked. This preview is not that count.</EmptyNote> : (
            <p className="text-3xl font-semibold text-slate-800">{data?.subscribers ?? "—"}</p>
          )}
        </Panel>
      </div>

      <Panel title="Delivery">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {METRICS.map((item) => (
            <Metric key={item.key} label={item.label} metric={data?.engagement?.[item.key]} preview={preview} />
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Recent campaigns">
          {preview || !data?.campaigns.length ? <EmptyNote>No campaigns yet. A draft stays here until you schedule it.</EmptyNote> : (
            <ul className="space-y-2 text-sm">
              {data.campaigns.map((campaign) => (
                <li key={campaign.id} className="flex justify-between gap-3">
                  <span>{campaign.name}</span>
                  <span className="text-slate-500">{campaign.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Upcoming sends">
          {preview || !data?.upcoming.length ? <EmptyNote>Nothing is scheduled. The daily check sends only campaigns whose time has arrived.</EmptyNote> : (
            <ul className="space-y-2 text-sm">
              {data.upcoming.map((campaign) => (
                <li key={campaign.id}>{campaign.name} · {campaign.scheduledAt}</li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Automations">
          {preview ? <EmptyNote>Starter flows stay off. Open Automations to see them. None send until you turn one on.</EmptyNote> : (
            <ul className="space-y-2 text-sm">
              {(data?.automations ?? []).map((automation) => (
                <li key={automation.id} className="flex justify-between gap-3">
                  <span>{automation.name}</span>
                  <span className="text-slate-500">{automation.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Activity">
          {preview || !data?.activity.length ? <EmptyNote>No marketing actions yet.</EmptyNote> : (
            <ul className="space-y-2 text-sm">
              {data.activity.map((item) => (
                <li key={item.id}>{item.action} · {item.actor ?? "system"}</li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Needs attention">
        {preview ? (
          <EmptyNote>When you are signed in, this lists a missing unsubscribe secret, a missing Resend key, or a missing webhook secret. A missing webhook is not a zero rate.</EmptyNote>
        ) : data?.alerts.length ? (
          <ul className="space-y-2 text-sm text-amber-900">
            {data.alerts.map((alert) => <li key={alert.text}>{alert.text}</li>)}
          </ul>
        ) : <EmptyNote>No setup problems are visible from here.</EmptyNote>}
      </Panel>
    </div>
  );
}
