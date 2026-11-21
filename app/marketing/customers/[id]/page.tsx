"use client";

import { Suspense, use } from "react";
import { PersonProfile } from "@/components/marketing/PeopleScreen";

export default function MarketingCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <PersonProfile customerId={id} />
    </Suspense>
  );
}
