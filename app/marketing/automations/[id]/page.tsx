"use client";

import { Suspense, use } from "react";
import { AutomationEditor } from "@/components/marketing/AutomationScreen";

export default function AutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <AutomationEditor automationId={id} />
    </Suspense>
  );
}
