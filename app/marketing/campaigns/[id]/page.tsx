"use client";

import { Suspense, use } from "react";
import { CampaignEditor } from "@/components/marketing/CampaignScreen";

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <CampaignEditor campaignId={id} />
    </Suspense>
  );
}
