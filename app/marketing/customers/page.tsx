"use client";

import { Suspense } from "react";
import PeopleScreen from "@/components/marketing/PeopleScreen";

export default function MarketingCustomersPage() {
  return (
    <Suspense>
      <PeopleScreen />
    </Suspense>
  );
}
