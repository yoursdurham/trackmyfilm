"use client";

import { Suspense } from "react";
import SettingsScreen from "@/components/marketing/SettingsScreen";

export default function MarketingSettingsPage() {
  return (
    <Suspense>
      <SettingsScreen />
    </Suspense>
  );
}
