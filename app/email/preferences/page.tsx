"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SHOP_NAME } from "@/lib/marketing/types";

function Preferences() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");

  async function save(next: "subscribed" | "unsubscribed") {
    const response = await fetch("/api/email/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, status: next, explicit: true }),
    });
    const body = await response.json();
    if (!response.ok) setNote(body.error ?? "That link could not be used.");
    else {
      setStatus(next);
      setNote(next === "subscribed" ? `You will get occasional email from ${SHOP_NAME}` : "You will not get marketing email. Order updates still arrive when you drop off film.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center bg-[#FFF6D3] px-6 py-16 text-[#1a1a1a]">
      <h1 className="text-2xl font-semibold">Email from {SHOP_NAME}</h1>
      <p className="mt-3 text-sm leading-6">This page only changes marketing email. It does not change messages about a drop-off, the lab, or scans.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={() => save("subscribed")}>Send me occasional email</Button>
        <Button variant="outline" onClick={() => save("unsubscribed")}>Stop marketing email</Button>
      </div>
      {status ? <p className="mt-4 text-sm">Current choice: {status}</p> : null}
      {note ? <p className="mt-4 text-sm">{note}</p> : null}
    </main>
  );
}

export default function PreferencesPage() {
  return (
    <Suspense>
      <Preferences />
    </Suspense>
  );
}
