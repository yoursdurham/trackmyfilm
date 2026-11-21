"use client";

import { Suspense } from "react";
import AutomationList from "@/components/marketing/AutomationScreen";

export default function AutomationsPage() {
  return (
    <Suspense>
      <AutomationList />
    </Suspense>
  );
}
