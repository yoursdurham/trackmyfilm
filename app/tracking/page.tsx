import { Suspense } from "react";
import RecoverySessionRedirect from "@/components/RecoverySessionRedirect";
import MilesSavedSection from "@/components/MilesSavedSection";
import { ViewAllOrdersLink } from "@/components/tracking/ViewAllOrdersLink";
import { ViewAllOrdersLinkForSession } from "@/components/tracking/ViewAllOrdersLinkForSession";
import TrackingHome from "./TrackingHome";

export const revalidate = 3600;

function trackingAccountLink() {
  return (
    <Suspense fallback={<ViewAllOrdersLink href="/account/login" />}>
      <ViewAllOrdersLinkForSession />
    </Suspense>
  );
}

export default function TrackingPage() {
  return (
    <Suspense fallback={null}>
      <RecoverySessionRedirect />
      <TrackingHome
        lookupAccountLink={trackingAccountLink()}
        resultAccountLink={trackingAccountLink()}
        milesSaved={
          <Suspense fallback={null}>
            <MilesSavedSection />
          </Suspense>
        }
      />
    </Suspense>
  );
}
