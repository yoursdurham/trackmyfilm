import { Suspense } from "react";
import RecoverySessionRedirect from "@/components/RecoverySessionRedirect";
import MilesSavedSection from "@/components/MilesSavedSection";
import { LogInToViewOrdersButton, ViewAllOrdersLink } from "@/components/tracking/ViewAllOrdersLink";
import {
  LogInToViewOrdersButtonForSession,
  ViewAllOrdersLinkForSession,
} from "@/components/tracking/ViewAllOrdersLinkForSession";
import TrackingHome from "./TrackingHome";

export const revalidate = 3600;

function trackingAccountLink() {
  return (
    <Suspense fallback={<ViewAllOrdersLink href="/account/login" />}>
      <ViewAllOrdersLinkForSession />
    </Suspense>
  );
}

function logInToViewOrders() {
  return (
    <Suspense fallback={<LogInToViewOrdersButton href="/account/login" />}>
      <LogInToViewOrdersButtonForSession />
    </Suspense>
  );
}

export default function TrackingPage() {
  return (
    <Suspense fallback={null}>
      <RecoverySessionRedirect />
      <TrackingHome
        logInToViewOrders={logInToViewOrders()}
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
