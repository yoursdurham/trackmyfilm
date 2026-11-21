import Link from "next/link";
import { Suspense } from "react";
import SegmentScreen from "@/components/marketing/SegmentScreen";

export default function SegmentsPage() {
  return (
    <Suspense>
      <div className="mb-3 text-sm">
        <Link href="/marketing/segments/new" className="text-amber-700 underline">New segment</Link>
      </div>
      <SegmentScreen />
    </Suspense>
  );
}
