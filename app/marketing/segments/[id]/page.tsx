"use client";

import { Suspense, use } from "react";
import SegmentScreen from "@/components/marketing/SegmentScreen";

export default function SegmentEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <SegmentScreen segmentId={id === "new" ? undefined : id} />
    </Suspense>
  );
}
