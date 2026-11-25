"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isMarketingPreview } from "@/lib/marketing/access";
import { renderMarketingHtml, samplePerson } from "@/lib/marketing/render";
import { DEFAULT_PHYSICAL_ADDRESS, type EmailBlock } from "@/lib/marketing/types";
import { Panel } from "@/components/marketing/MarketingShell";

const STARTER_BLOCKS: EmailBlock[] = [
  { id: "heading", type: "heading", text: "A note from Yours," },
  { id: "body", type: "text", text: "Hi {{first_name}},\n\nWrite what you want to say. This stays a draft until you confirm a campaign." },
  { id: "cta", type: "button", label: "Open your account", href: "https://trackmyfilm.com/account" },
];

export default function EditorScreen({
  initialSubject = "",
  initialPreview = "",
  initialBlocks = STARTER_BLOCKS,
  initialPlain = "",
  onChange,
}: {
  initialSubject?: string;
  initialPreview?: string;
  initialBlocks?: EmailBlock[];
  initialPlain?: string;
  onChange?: (value: { subject: string; previewText: string; blocks: EmailBlock[]; plainText: string }) => void;
}) {
  const params = useSearchParams();
  const previewMode = isMarketingPreview("/marketing", params.get("preview"));
  const [subject, setSubject] = useState(initialSubject);
  const [previewText, setPreviewText] = useState(initialPreview);
  const [blocks, setBlocks] = useState<EmailBlock[]>(initialBlocks);
  const [plainText, setPlainText] = useState(initialPlain);
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
  const [testTo, setTestTo] = useState("");
  const [testNote, setTestNote] = useState("");

  function publish(next: { subject?: string; previewText?: string; blocks?: EmailBlock[]; plainText?: string }) {
    const value = {
      subject: next.subject ?? subject,
      previewText: next.previewText ?? previewText,
      blocks: next.blocks ?? blocks,
      plainText: next.plainText ?? plainText,
    };
    onChange?.(value);
  }

  const html = useMemo(() => renderMarketingHtml({
    draft: { subject, previewText, blocks, plainText },
    person: samplePerson(),
    previewText,
    unsubscribeUrl: "https://trackmyfilm.com/email/unsubscribe",
    physicalAddress: DEFAULT_PHYSICAL_ADDRESS,
    hoursLabel: "Retail Hours: Thursdays 5-7PM & Saturdays 11-2PM",
  }), [subject, previewText, blocks, plainText]);

  async function testSend() {
    setTestNote("");
    if (previewMode) {
      setTestNote("Sign in to send a test. A test goes only to the address you type.");
      return;
    }
    const response = await fetch("/api/marketing/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: subject || "Test draft", subject, previewText, blocks, plainText }),
    });
    const saved = await response.json();
    if (!response.ok) {
      setTestNote(saved.error ?? "Could not prepare the test.");
      return;
    }
    setTestNote("Save this on a campaign, then use Test send there. A template itself is not mailed to the list.");
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <div className="space-y-4">
        <Panel title="Email">
          <label className="block text-sm text-slate-600">Subject
            <Input className="mt-1" value={subject} onChange={(event) => { setSubject(event.target.value); publish({ subject: event.target.value }); }} />
          </label>
          <label className="mt-3 block text-sm text-slate-600">Preview text
            <Input className="mt-1" value={previewText} onChange={(event) => { setPreviewText(event.target.value); publish({ previewText: event.target.value }); }} />
          </label>
          <div className="mt-4 space-y-3">
            {blocks.map((block, index) => (
              <div key={block.id} className="rounded-xl bg-stone-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">{block.type}</p>
                {block.type === "button" ? (
                  <>
                    <Input className="mt-2" value={block.label} onChange={(event) => updateBlock(index, { ...block, label: event.target.value })} />
                    <Input className="mt-2" value={block.href} onChange={(event) => updateBlock(index, { ...block, href: event.target.value })} />
                  </>
                ) : (
                  <Textarea className="mt-2" value={block.text} onChange={(event) => updateBlock(index, { ...block, text: event.target.value })} />
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => add({ id: crypto.randomUUID(), type: "text", text: "" })}>Add text</Button>
              <Button type="button" variant="outline" onClick={() => add({ id: crypto.randomUUID(), type: "button", label: "Visit Yours,", href: "https://www.yoursdurham.com" })}>Add button</Button>
            </div>
          </div>
          <label className="mt-4 block text-sm text-slate-600">Plain text version
            <Textarea className="mt-1" value={plainText} onChange={(event) => { setPlainText(event.target.value); publish({ plainText: event.target.value }); }} placeholder="Leave blank to build this from the blocks." />
          </label>
          <p className="mt-3 text-xs text-slate-500">Placeholders: {"{{first_name}}"} falls back to “there”. {"{{shop_name}}"} is “Yours,”. {"{{dropoff_count}}"} falls back to “several”. Other placeholders are rejected before a send.</p>
        </Panel>
        <Panel title="Test send">
          <p className="mb-2 text-sm text-slate-600">One address, typed here. This never uses a segment.</p>
          <Input value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="name@email.com" />
          <Button className="mt-3" variant="outline" onClick={testSend}>Send test</Button>
          {testNote ? <p className="mt-2 text-sm text-slate-700">{testNote}</p> : null}
        </Panel>
      </div>
      <Panel title="Preview" action={
        <div className="flex gap-2">
          <Button type="button" variant={width === "desktop" ? "default" : "outline"} onClick={() => setWidth("desktop")}>Desktop</Button>
          <Button type="button" variant={width === "mobile" ? "default" : "outline"} onClick={() => setWidth("mobile")}>Mobile</Button>
        </div>
      }>
        <div className={width === "mobile" ? "mx-auto w-[390px] max-w-full" : "w-full"}>
          <iframe title="Email preview" className="h-[720px] w-full rounded-xl bg-white ring-1 ring-stone-200" srcDoc={html} />
        </div>
      </Panel>
    </div>
  );

  function updateBlock(index: number, block: EmailBlock) {
    const next = blocks.slice();
    next[index] = block;
    setBlocks(next);
    publish({ blocks: next });
  }

  function add(block: EmailBlock) {
    const next = [...blocks, block];
    setBlocks(next);
    publish({ blocks: next });
  }
}
