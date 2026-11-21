"use client";

import { Suspense } from "react";
import OverviewScreen from "@/components/marketing/OverviewScreen";

export default function MarketingPage() {
  return (
    <Suspense>
      <OverviewScreen />
    </Suspense>
  );
}
