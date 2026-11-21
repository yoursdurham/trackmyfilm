"use client";

import { Suspense } from "react";
import CampaignList from "@/components/marketing/CampaignScreen";

export default function CampaignsPage() {
  return (
    <Suspense>
      <CampaignList />
    </Suspense>
  );
}
