"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isMarketingPreview } from "@/lib/marketing/access";
import { FILTER_FIELDS, ORDER_STATUS_OPTIONS, type Condition, type FilterNode } from "@/lib/marketing/types";
import { FILM_TYPES } from "@/lib/validation";
import { EmptyNote, Panel } from "@/components/marketing/MarketingShell";

type Preview = {
  unavailable: string | null;
  recipientCount?: number;
  excludedCount?: number;
  recipients: { email: string; firstName: string }[];
  excluded: { email: string; reasons: string[] }[];
  fingerprint?: string;
};

const DEFAULT_FILTER: FilterNode = {
  op: "and",
  children: [
    { op: "condition", condition: { type: "has_account", value: true } },
    {
      op: "or",
      children: [
        { op: "condition", condition: { type: "scans_sent", value: true } },
        { op: "condition", condition: { type: "total_dropoffs", op: "gte", value: 2 } },
      ],
    },
  ],
};

function conditionLabel(condition: Condition) {
  const field = FILTER_FIELDS.find((item) => item.type === condition.type)?.label ?? "Filter";
  if (condition.type === "no_account_with_dropoff") return field;
  if ("value" in condition && typeof condition.value === "boolean") return `${field}: ${condition.value ? "yes" : "no"}`;
  if ("op" in condition && condition.op === "gte") return `${field}: at least ${condition.value}`;
  if ("op" in condition && condition.op === "lte") return `${field}: at most ${condition.value}`;
  if ("op" in condition && condition.op === "eq") return `${field}: exactly ${condition.value}`;
  if ("value" in condition) return `${field}: ${String(condition.value)}`;
  return field;
}

export default function SegmentScreen({ segmentId }: { segmentId?: string }) {
  const params = useSearchParams();
  const preview = isMarketingPreview("/marketing/segments", params.get("preview"));
  const [name, setName] = useState(segmentId ? "" : "People with an account");
  const [filter, setFilter] = useState<FilterNode>(DEFAULT_FILTER);
  const [result, setResult] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (preview) return;
    const handle = setTimeout(() => {
      void fetch("/api/marketing/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter }),
      }).then(async (response) => {
        const body = await response.json();
        if (!response.ok) setError(body.error ?? "Could not count this segment.");
        else {
          setError("");
          setResult(body);
        }
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [filter, preview]);

  async function save() {
    setSaved("");
    const response = await fetch(segmentId ? `/api/marketing/segments/${segmentId}` : "/api/marketing/segments", {
      method: segmentId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, filter }),
    });
    const body = await response.json();
    setSaved(response.ok ? "Segment saved." : body.error ?? "Could not save.");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <Panel title="Segment" action={preview ? null : <Button onClick={save}>Save segment</Button>}>
        <label className="mb-3 block text-sm text-slate-600">
          Name
          <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <FilterEditor filter={filter} onChange={setFilter} />
        <p className="mt-3 text-sm text-slate-500">
          Filters use orders, accounts, photos, and customer totals. Marketing consent is applied after this and cannot be turned off. An account or an order is not consent.
        </p>
        {saved ? <p className="mt-2 text-sm text-slate-700">{saved}</p> : null}
      </Panel>
      <Panel title="Who would receive it">
        {preview ? (
          <EmptyNote>
            The live count appears after you sign in. This preview does not invent a number. People without marketing consent, and anyone unsubscribed, bounced, complained, suppressed, or with an invalid address, are listed here with the reason.
          </EmptyNote>
        ) : error ? <p className="text-sm text-red-700">{error}</p> : result?.unavailable ? (
          <EmptyNote>{result.unavailable}</EmptyNote>
        ) : (
          <div className="space-y-3 text-sm">
            <p><strong>{result?.recipientCount ?? 0}</strong> with consent. <strong>{result?.excludedCount ?? 0}</strong> match the filter and are excluded.</p>
            <div>
              <p className="font-medium text-slate-700">Recipients</p>
              {result?.recipients.length ? result.recipients.map((person) => <p key={person.email}>{person.firstName || "No first name"} · {person.email}</p>) : <p className="text-slate-500">None yet.</p>}
            </div>
            <div>
              <p className="font-medium text-slate-700">Excluded</p>
              {result?.excluded.length ? result.excluded.map((person) => (
                <p key={person.email}>{person.email}: {person.reasons.join(", ")}</p>
              )) : <p className="text-slate-500">No exclusions for this filter.</p>}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function FilterEditor({ filter, onChange }: { filter: FilterNode; onChange: (next: FilterNode) => void }) {
  if (filter.op === "condition") return null;
  return (
    <div className="space-y-3 rounded-xl bg-stone-50 p-3">
      <div className="flex gap-2">
        {(["and", "or"] as const).map((op) => (
          <button
            key={op}
            type="button"
            className={`rounded-full px-3 py-1 text-sm ${filter.op === op ? "bg-amber-200 text-amber-900" : "bg-white ring-1 ring-stone-200"}`}
            onClick={() => onChange({ ...filter, op })}
          >
            {op === "and" ? "All of these" : "Any of these"}
          </button>
        ))}
      </div>
      {filter.children.map((child, index) => (
        <div key={index} className="rounded-lg bg-white p-3 ring-1 ring-stone-200">
          {child.op === "condition" ? (
            <p className="text-sm text-slate-700">{conditionLabel(child.condition)}</p>
          ) : (
            <FilterEditor filter={child} onChange={(next) => {
              const children = filter.children.slice();
              children[index] = next;
              onChange({ ...filter, children });
            }} />
          )}
          <button
            type="button"
            className="mt-2 text-xs text-slate-500 underline"
            onClick={() => onChange({ ...filter, children: filter.children.filter((_, childIndex) => childIndex !== index) })}
          >
            Remove
          </button>
        </div>
      ))}
      <ConditionAdder onAdd={(condition) => onChange({ ...filter, children: [...filter.children, { op: "condition", condition }] })} />
    </div>
  );
}

function ConditionAdder({ onAdd }: { onAdd: (condition: Condition) => void }) {
  const [type, setType] = useState<Condition["type"]>("has_account");
  const field = FILTER_FIELDS.find((item) => item.type === type);
  return (
    <div className="space-y-2">
      <select className="h-8 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm" value={type} onChange={(event) => setType(event.target.value as Condition["type"])}>
        {FILTER_FIELDS.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
      </select>
      <p className="text-xs text-slate-500">{field?.help}</p>
      <Button type="button" variant="outline" onClick={() => onAdd(defaultCondition(type))}>Add condition</Button>
      <div className="hidden">
        {ORDER_STATUS_OPTIONS.join(",")}
        {FILM_TYPES.join(",")}
      </div>
    </div>
  );
}

function defaultCondition(type: Condition["type"]): Condition {
  switch (type) {
    case "has_account":
    case "has_photo":
    case "scans_sent":
      return { type, value: true };
    case "no_account_with_dropoff":
      return { type };
    case "total_dropoffs":
    case "total_rolls":
      return { type, op: "gte", value: 1 };
    case "days_since_last_dropoff":
    case "days_since_first_scans":
      return { type, op: "gte", value: 30 };
    case "ever_status":
      return { type, value: "Scans Sent" };
    case "film_type":
      return { type, value: "35mm" };
    case "film_process":
      return { type, value: "Color" };
    case "film_stock_contains":
      return { type, value: "Portra" };
    default:
      return { type: "has_account", value: true };
  }
}
