"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isMarketingPreview } from "@/lib/marketing/access";
import { EmptyNote, Panel } from "@/components/marketing/MarketingShell";

export default function PeopleScreen() {
  const params = useSearchParams();
  const preview = isMarketingPreview("/marketing/customers", params.get("preview"));
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<{ customerId: string | null; email: string; firstName: string; lastName: string; subscriptionStatus: string }[]>([]);
  const [error, setError] = useState("");

  async function search() {
    const response = await fetch(`/api/marketing/people?q=${encodeURIComponent(query)}`);
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "Could not search.");
    else {
      setError("");
      setPeople(body.people ?? []);
    }
  }

  return (
    <Panel title="People">
      <p className="mb-3 text-sm text-slate-600">Search customers by name or email. Subscription status is separate from having an order or an account.</p>
      {preview ? <EmptyNote>Sign in to search. This preview does not list sample customers.</EmptyNote> : (
        <>
          <div className="flex gap-2">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or email" />
            <Button onClick={search}>Search</Button>
          </div>
          {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
          <ul className="mt-4 space-y-2 text-sm">
            {people.map((person) => (
              <li key={person.email}>
                {person.customerId ? <Link className="underline" href={`/marketing/customers/${person.customerId}`}>{person.firstName} {person.lastName}</Link> : <span>{person.email}</span>}
                {" · "}{person.subscriptionStatus}
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

export function PersonProfile({ customerId }: { customerId: string }) {
  const [profile, setProfile] = useState<{
    person: { email: string; firstName: string };
    subscriptionStatus: string;
    timeline: { at: string; label: string }[];
    deliveries: { id: string; status: string; sent_at: string | null }[];
    enrollments: { id: string; status: string; exit_reason: string | null }[];
  } | null>(null);
  const [error, setError] = useState("");
  const [explicit, setExplicit] = useState(false);

  if (!profile && !error) {
    void fetch(`/api/marketing/people/${customerId}`).then(async (response) => {
      const body = await response.json();
      if (!response.ok) setError(body.error ?? "Could not load this person.");
      else setProfile(body);
    });
  }

  async function consent(status: "subscribed" | "unsubscribed") {
    if (!profile) return;
    const response = await fetch("/api/marketing/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: profile.person.email, customerId, status, explicit: status === "unsubscribed" ? true : explicit }),
    });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "Could not update consent.");
    else setProfile({ ...profile, subscriptionStatus: status });
  }

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!profile) return <p className="text-sm text-slate-500">Loading.</p>;
  return (
    <div className="space-y-4">
      <Panel title={`${profile.person.firstName || "Customer"} · ${profile.person.email}`}>
        <p className="text-sm">Marketing: {profile.subscriptionStatus}</p>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={explicit} onChange={(event) => setExplicit(event.target.checked)} />
          This person asked Yours, for marketing email.
        </label>
        <div className="mt-3 flex gap-2">
          <Button disabled={!explicit} onClick={() => consent("subscribed")}>Record consent</Button>
          <Button variant="outline" onClick={() => consent("unsubscribed")}>Unsubscribe</Button>
        </div>
      </Panel>
      <Panel title="Activity">
        {profile.timeline.length ? profile.timeline.map((event) => <p key={`${event.at}${event.label}`} className="text-sm">{event.label}</p>) : <EmptyNote>No recorded activity for this email.</EmptyNote>}
      </Panel>
      <Panel title="Marketing email">
        {profile.deliveries.length ? profile.deliveries.map((row) => <p key={row.id} className="text-sm">{row.status} {row.sent_at ?? ""}</p>) : <EmptyNote>No marketing email has been sent to this address.</EmptyNote>}
      </Panel>
      <Panel title="Automations">
        {profile.enrollments.length ? profile.enrollments.map((row) => <p key={row.id} className="text-sm">{row.status} {row.exit_reason ?? ""}</p>) : <EmptyNote>Not enrolled in an automation.</EmptyNote>}
      </Panel>
    </div>
  );
}
