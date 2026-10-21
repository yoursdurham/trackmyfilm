import { Suspense } from "react";
import RecoverySessionRedirect from "@/components/RecoverySessionRedirect";
import MilesSavedSection from "@/components/MilesSavedSection";
import TrackingHome from "./TrackingHome";

export const revalidate = 3600;

export default function TrackingPage() {
  return (
    <Suspense fallback={null}>
      <RecoverySessionRedirect />
      <TrackingHome
        milesSaved={
          <Suspense fallback={null}>
            <MilesSavedSection />
          </Suspense>
        }
      />
    </Suspense>
  );
}
